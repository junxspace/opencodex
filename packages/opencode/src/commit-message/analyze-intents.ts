import { Agent } from "@/agent/agent"
import { AppRuntime } from "@/effect/app-runtime"
import { LLM } from "@/session/llm"
import { LLMText } from "@/session/llm-text"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { MessageID, SessionID } from "@/session/schema"
import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { getGitContext, isLockFile } from "./git-context"
import { attachLockFiles, briefLockMessage, partitionLockFiles } from "./lock"
import { INTENT_ANALYSIS_PROMPT } from "./prompt"
import { CommitMessageRuntime } from "./generate"
import type { InstanceContext } from "@/project/instance-context"
import { InstanceRef } from "@/effect/instance-ref"

const log = Log.create({ service: "commit-intent" })

export type CommitIntent = {
  files: string[]
  description: string
  message?: string
}

export type IntentAnalysisRequest = {
  path: string
  selectedFiles: string[]
  model?: string
  instance?: InstanceContext
  lockTemplate?: string
}

function cleanJson(text: string) {
  let result = text.trim()
  if (result.startsWith("```")) {
    const first = result.indexOf("\n")
    if (first !== -1) result = result.slice(first + 1)
  }
  if (result.endsWith("```")) result = result.slice(0, -3)
  return result.trim()
}

function buildAnalysisMessage(ctx: Awaited<ReturnType<typeof getGitContext>>, files: string[]) {
  const listed = files
    .map((file) => {
      if (isLockFile(file)) return `${file} (lock file, no diff)`
      const entry = ctx.files.find((item) => item.path === file)
      if (!entry) return `${file} (changed)`
      return `${entry.status} ${entry.path}\n${entry.diff}`
    })
    .join("\n\n")

  return `Split the following changed files into commit intents:

Branch: ${ctx.branch}
Recent commits:
${ctx.recentCommits.join("\n")}

Changed files:
${listed}`
}

function parseIntentJson(text: string, known: Set<string>) {
  const parsed = JSON.parse(cleanJson(text)) as {
    intents?: Array<{ files?: string[]; description?: string }>
  }
  if (!Array.isArray(parsed.intents)) throw new Error("invalid intents")
  const intents: CommitIntent[] = []
  const seen = new Set<string>()
  for (const item of parsed.intents) {
    const itemFiles = Array.isArray(item.files) ? item.files.filter((file) => typeof file === "string" && known.has(file)) : []
    const unique = itemFiles.filter((file) => {
      if (seen.has(file)) return false
      seen.add(file)
      return true
    })
    if (unique.length === 0) continue
    intents.push({
      files: unique,
      description: typeof item.description === "string" && item.description.trim() ? item.description.trim() : "related changes",
    })
  }
  const missing = [...known].filter((file) => !seen.has(file))
  if (missing.length > 0 && intents.length > 0) intents[intents.length - 1]!.files.push(...missing)
  if (intents.length === 0) throw new Error("empty intents")
  return intents
}

const TIMEOUT_MS = 120_000

export async function analyzeIntents(request: IntentAnalysisRequest): Promise<{ intents: CommitIntent[] }> {
  const { locks, nonLocks } = partitionLockFiles(request.selectedFiles)
  if (nonLocks.length === 0 && locks.length > 0) {
    return {
      intents: [{ files: locks, description: "update lock files", message: briefLockMessage(locks, request.lockTemplate) }],
    }
  }
  if (nonLocks.length === 0) return { intents: [] }

  const ctx = await getGitContext(request.path, nonLocks)
  const model = await CommitMessageRuntime.model(request.model, request.instance)
  const agent: Agent.Info = {
    name: "commit-intent",
    mode: "primary",
    hidden: true,
    options: {},
    permission: [],
    prompt: INTENT_ANALYSIS_PROMPT,
    temperature: 0.2,
  }

  const sessionID = SessionID.make("ses_commit_intent")
  const messageID = MessageID.make("msg_commit_intent")
  const streamInput = {
    agent,
    user: {
      id: messageID,
      sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: "commit-intent",
      model: { providerID: model.providerID, modelID: model.id },
    } satisfies SessionV1.User,
    tools: {},
    model,
    small: true,
    messages: [{ role: "user" as const, content: buildAnalysisMessage(ctx, request.selectedFiles) }],
    sessionID,
    system: [],
    retries: 2,
  }

  const known = new Set(nonLocks)
  let intents: CommitIntent[]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const result = await AppRuntime.runPromise(
      LLM.Service.use((svc) =>
        LLMText.text(svc.stream(streamInput)).pipe(Effect.orDie, Effect.provideService(InstanceRef, request.instance)),
      ),
      { signal: controller.signal },
    )
    intents = parseIntentJson(result, known)
    log.info("analyzed", { intents: intents.length })
  } catch (err) {
    log.error("intent analysis failed, using single-intent fallback", {
      error: err instanceof Error ? err.message : String(err),
    })
    intents = [{ files: nonLocks, description: "related changes" }]
  } finally {
    clearTimeout(timer)
  }

  return { intents: attachLockFiles(intents, locks) }
}
