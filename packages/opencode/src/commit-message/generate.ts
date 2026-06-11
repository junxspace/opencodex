import { Provider } from "@/provider/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { LLM } from "@/session/llm"
import { LLMText } from "@/session/llm-text"
import { Agent } from "@/agent/agent"
import { AppRuntime } from "@/effect/app-runtime"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { MessageID, SessionID } from "@/session/schema"
import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import type { CommitMessageRequest, CommitMessageResponse, GitContext } from "./types"
import { getGitContext } from "./git-context"
import type { InstanceContext } from "@/project/instance-context"
import { InstanceRef } from "@/effect/instance-ref"

const log = Log.create({ service: "commit-message" })

export const CommitMessageRuntime = {
  context(repoPath: string, selectedFiles?: string[]) {
    return getGitContext(repoPath, selectedFiles)
  },
  model(ref?: string, instance?: InstanceContext) {
    return AppRuntime.runPromise(
      Provider.Service.use((svc) =>
        Effect.gen(function* () {
          if (ref) {
            const [provider, ...parts] = ref.split("/")
            const model = parts.join("/")
            if (provider && model) return yield* svc.getModel(ProviderV2.ID.make(provider), ModelV2.ID.make(model))
          }
          const cfg = yield* svc.defaultModel()
          return (yield* svc.getSmallModel(cfg.providerID)) ?? (yield* svc.getModel(cfg.providerID, cfg.modelID))
        }).pipe(Effect.provideService(InstanceRef, instance)),
      ),
    )
  },
  generate(input: LLM.StreamInput, signal: AbortSignal, instance?: InstanceContext) {
    return AppRuntime.runPromise(
      LLM.Service.use((svc) =>
        LLMText.text(svc.stream(input)).pipe(Effect.orDie, Effect.provideService(InstanceRef, instance)),
      ),
      {
        signal,
      },
    )
  },
}

const SYSTEM_PROMPT = `You are an expert Git commit message generator that creates conventional commit messages based on staged changes. Analyze the provided git diff output and generate an appropriate conventional commit message following the specification.

## Conventional Commits Format
Generate commit messages following this exact structure:
\`\`\`
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
\`\`\`

### Core Types (Required)
- **feat**: New feature or functionality (MINOR version bump)
- **fix**: Bug fix or error correction (PATCH version bump)

### Additional Types (Extended)
- **docs**: Documentation changes only
- **style**: Code style changes (whitespace, formatting, semicolons, etc.)
- **refactor**: Code refactoring without feature changes or bug fixes
- **perf**: Performance improvements
- **test**: Adding or fixing tests
- **build**: Build system or external dependency changes
- **ci**: CI/CD configuration changes
- **chore**: Maintenance tasks, tooling changes
- **revert**: Reverting previous commits

### Scope Guidelines
- Use parentheses: \`feat(api):\`, \`fix(ui):\`
- Common scopes: \`api\`, \`ui\`, \`auth\`, \`db\`, \`config\`, \`deps\`, \`docs\`
- For monorepos: package or module names
- Keep scope concise and lowercase

### Description Rules
- Use imperative mood ("add" not "added" or "adds")
- Start with lowercase letter
- No period at the end
- Maximum 72 characters
- Be concise but descriptive

### Body Guidelines (Optional)
- Start one blank line after description
- Explain the "what" and "why", not the "how"
- Wrap at 72 characters per line
- Use for complex changes requiring explanation

### Footer Guidelines (Optional)
- Start one blank line after body
- **Breaking Changes**: \`BREAKING CHANGE: description\`

## Analysis Instructions
When analyzing staged changes:
1. Determine Primary Type based on the nature of changes
2. Identify Scope from modified directories or modules
3. Craft Description focusing on the most significant change
4. Determine if there are Breaking Changes
5. For complex changes, include a detailed body explaining what and why
6. Add appropriate footers for issue references or breaking changes

For significant changes, include a detailed body explaining the changes.

Return ONLY the commit message in the conventional format, nothing else.`

function buildUserMessage(ctx: GitContext) {
  const fileList = ctx.files.map((f) => `${f.status} ${f.path}`).join("\n")
  const diffs = ctx.files
    .filter((f) => f.diff)
    .map((f) => `--- ${f.path} ---\n${f.diff}`)
    .join("\n\n")

  return `Generate a commit message for the following changes:

Branch: ${ctx.branch}
Recent commits:
${ctx.recentCommits.join("\n")}

Changed files:
${fileList}

Diffs:
${diffs}`
}

function clean(text: string) {
  let result = text.trim()
  if (result.startsWith("```")) {
    const first = result.indexOf("\n")
    if (first !== -1) {
      result = result.slice(first + 1)
    }
  }
  if (result.endsWith("```")) {
    result = result.slice(0, -3)
  }
  result = result.trim()
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1)
  }
  return result.trim()
}

const TIMEOUT_MS = 120_000
const MAX_ATTEMPTS = 3

function isRetryableGenerationError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("SSE read timed out") || msg.includes("response headers timed out")
}

export async function generateCommitMessage(request: CommitMessageRequest): Promise<CommitMessageResponse> {
  const ctx = await CommitMessageRuntime.context(request.path, request.selectedFiles)
  if (ctx.files.length === 0) {
    throw new Error("No changes found to generate a commit message for")
  }

  log.info("generating", {
    branch: ctx.branch,
    files: ctx.files.length,
  })

  const model = await CommitMessageRuntime.model(request.model, request.instance)

  const agent: Agent.Info = {
    name: "commit-message",
    mode: "primary",
    hidden: true,
    options: {},
    permission: [],
    prompt: request.prompt || SYSTEM_PROMPT,
    temperature: 0.3,
  }

  let userMessage = buildUserMessage(ctx)
  if (request.intent) {
    userMessage = `Commit intent: ${request.intent.description}\nFiles in this commit:\n${request.intent.files.join("\n")}\n\n${userMessage}`
  }
  if (request.previousMessage) {
    userMessage = `IMPORTANT: Generate a COMPLETELY DIFFERENT commit message from the previous one. The previous message was: "${request.previousMessage}". Use a different type, scope, or description approach.\n\n${userMessage}`
  }

  const sessionID = SessionID.make("ses_commit_message")
  const messageID = MessageID.make("msg_commit_message")
  const streamInput = {
    agent,
    user: {
      id: messageID,
      sessionID,
      role: "user",
      time: {
        created: Date.now(),
      },
      agent: "commit-message",
      model: {
        providerID: model.providerID,
        modelID: model.id,
      },
    } satisfies SessionV1.User,
    tools: {},
    model,
    small: true,
    messages: [
      {
        role: "user" as const,
        content: userMessage,
      },
    ],
    sessionID,
    system: [],
    retries: 3,
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const result = await CommitMessageRuntime.generate(streamInput, controller.signal, request.instance)
      log.info("generated", { message: result })
      return { message: clean(result) }
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Commit message generation timed out after ${TIMEOUT_MS / 1000} seconds`)
      }
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt < MAX_ATTEMPTS && isRetryableGenerationError(err)) {
        log.warn("generation retry", { attempt, error: msg })
        await Bun.sleep(2000 * attempt)
        continue
      }
      log.error("generation failed", { error: msg })
      throw new Error(`Failed to generate commit message: ${msg}`)
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error("Failed to generate commit message")
}
