import type { Argv } from "yargs"
import * as prompts from "@clack/prompts"
import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { resolveCliStyle } from "../theme"
import { UI } from "../ui"
import { commitUi, type FastCommitUi, type Status } from "./fast-commit-ui"
import { Config } from "@/config/config"
import { InstanceRef } from "@/effect/instance-ref"
import { invocationDirectory } from "../invocation-directory"
import { analyzeIntents, type CommitIntent } from "@/commit-message/analyze-intents"
import { generateCommitMessage } from "@/commit-message"
import { briefLockMessage, partitionLockFiles } from "@/commit-message/lock"
import { isLockFile } from "@/commit-message/git-context"
import { FAST_COMMIT_SYSTEM_PROMPT } from "@/commit-message/prompt"
import type { CommitMessageRequest } from "@/commit-message/types"

export type { Status }

type GitResult = {
  code: number
  stdout: string
  stderr: string
}

type Action = "commit" | "edit" | "regenerate" | "cancel"

type Args = {
  dir?: string
  push?: boolean
  confirm?: boolean
  dryRun?: boolean
  stagedOnly?: boolean
  previous?: string
  prompt?: string
  model?: string
  lockTemplate?: string
  instance?: CommitMessageRequest["instance"]
  git?: (args: string[], cwd: string) => GitResult
  generate?: typeof generateCommitMessage
  analyze?: typeof analyzeIntents
  selectAction?: (message: string, intent: CommitIntent, index: number, total: number) => Promise<Action>
  edit?: (message: string) => Promise<string | undefined>
  onProgress?: (current: number, total: number, intent: CommitIntent) => void
  output?: (text: string) => void
  error?: (text: string) => void
  exit?: (code: number) => void
  style?: Parameters<typeof commitUi>[0]
}

type CliArgs = {
  dir?: string
  confirm?: boolean
  "dry-run"?: boolean
  "staged-only"?: boolean
  previous?: string
}

function git(args: string[], cwd: string): GitResult {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  })
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

export function parseStatus(text: string): Status {
  const staged = new Set<string>()
  const unstaged = new Set<string>()
  const untracked = new Set<string>()
  for (const line of text.split("\n")) {
    if (!line) continue
    const code = line.slice(0, 2)
    const path = line.slice(3)
    if (!path) continue
    if (code === "??") {
      untracked.add(path)
      continue
    }
    if (code[0] !== " ") staged.add(path)
    if (code[1] !== " ") unstaged.add(path)
  }
  return {
    staged: [...staged],
    unstaged: [...unstaged],
    untracked: [...untracked],
  }
}

function empty(status: Status) {
  return status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0
}

function allFiles(status: Status) {
  return [...new Set([...status.staged, ...status.unstaged, ...status.untracked])]
}

export function selectedFiles(status: Status, stagedOnly?: boolean) {
  if (stagedOnly) return status.staged
  return allFiles(status)
}

function check(result: GitResult, error: (text: string) => void, exit: (code: number) => void) {
  if (result.code === 0) return true
  error(result.stderr.trim() || result.stdout.trim() || "git command failed")
  exit(result.code || 1)
  return false
}

function runPush(
  run: (args: string[], cwd: string) => GitResult,
  root: string,
  out: (text: string) => void,
  error: (text: string) => void,
  exit: (code: number) => void,
  ui: FastCommitUi,
) {
  const result = run(["push"], root)
  if (!check(result, error, exit)) return false
  const text = result.stdout.trim()
  if (text) out(ui.gitOutput(text))
  out(ui.success("  🚀 Pushed to remote"))
  return true
}

const PREVIEW_FILE_LIMIT = 15

function previewFiles(files: string[]) {
  if (files.length <= PREVIEW_FILE_LIMIT) return files.map((file) => `  ${file}`).join("\n")
  const shown = files.slice(0, PREVIEW_FILE_LIMIT).map((file) => `  ${file}`)
  shown.push(`  ... and ${files.length - PREVIEW_FILE_LIMIT} more`)
  return shown.join("\n")
}

export function preview(message: string, intent?: CommitIntent) {
  const [subject = "", ...body] = message.trim().split("\n")
  const parts = [
    `Commit message\n  ${subject}${body.length ? `\n${body.filter((line) => line.trim()).map((line) => `  ${line}`).join("\n")}` : ""}`,
  ]
  if (intent) parts.push(`Files to commit\n${previewFiles(intent.files)}`)
  return parts.join("\n\n")
}

async function selectAction(message: string, intent: CommitIntent, index: number, total: number): Promise<Action> {
  prompts.note(preview(message, intent), `Commit preview (${index}/${total})`)
  const result = await prompts.select({
    message: "Commit this change?",
    options: [
      { value: "commit", label: "Commit" },
      { value: "edit", label: "Edit" },
      { value: "regenerate", label: "Regenerate" },
      { value: "cancel", label: "Cancel" },
    ],
  })
  if (prompts.isCancel(result)) return "cancel"
  return result as Action
}

async function edit(message: string) {
  const result = await prompts.text({
    message: "Edit commit message",
    initialValue: message,
  })
  if (prompts.isCancel(result)) return undefined
  return String(result).trim()
}

function messageForIntent(intent: CommitIntent, lockTemplate?: string) {
  if (intent.message) return intent.message
  const { locks, nonLocks } = partitionLockFiles(intent.files)
  if (nonLocks.length === 0 && locks.length > 0) return briefLockMessage(locks, lockTemplate)
  return undefined
}

function nonLockFiles(files: string[]) {
  return files.filter((file) => !isLockFile(file))
}

export type FastCommitResult = {
  commitCount: number
  pushed: boolean
  pushFailed: boolean
}

export async function handleFastCommit(args: Args): Promise<FastCommitResult> {
  const root = invocationDirectory(args.dir)
  const run = args.git ?? git
  const out = args.output ?? ((text: string) => UI.println(text))
  const error = args.error ?? UI.error
  const exit = args.exit ?? ((code: number) => (process.exitCode = code))
  const ui = commitUi(args.style ?? (await resolveCliStyle({ directory: root })))
  const statusResult = run(["status", "--porcelain"], root)
  if (!check(statusResult, error, exit)) return { commitCount: 0, pushed: false, pushFailed: false }

  const status = parseStatus(statusResult.stdout)
  out(ui.statusOverview(status))

  const committable = selectedFiles(status, args.stagedOnly)
  if (empty(status) || committable.length === 0) {
    out(ui.info("没有可提交的变更"))
    return { commitCount: 0, pushed: false, pushFailed: false }
  }

  const unstaged = run(["diff"], root)
  if (!check(unstaged, error, exit)) return { commitCount: 0, pushed: false, pushFailed: false }
  const staged = run(["diff", "--staged"], root)
  if (!check(staged, error, exit)) return { commitCount: 0, pushed: false, pushFailed: false }

  const analysis = await (args.analyze ?? analyzeIntents)({
    path: root,
    selectedFiles: committable,
    model: args.model,
    instance: args.instance,
    lockTemplate: args.lockTemplate,
  })
  const intents = analysis.intents.filter((intent) => intent.files.length > 0)
  if (intents.length === 0) {
    out(ui.info("没有可提交的变更"))
    return { commitCount: 0, pushed: false, pushFailed: false }
  }

  if (!args.dryRun) {
    const reset = run(["reset"], root)
    if (!check(reset, error, exit)) return { commitCount: 0, pushed: false, pushFailed: false }
  }

  out(ui.intentPlan(intents.length))

  const gen = args.generate ?? generateCommitMessage
  let committed = false
  let commitCount = 0
  for (const [index, intent] of intents.entries()) {
    args.onProgress?.(index + 1, intents.length, intent)
    const known = new Set(allFiles(status))
    const invalid = intent.files.filter((file) => !known.has(file))
    if (invalid.length > 0) {
      error(`Intent references files that are not changed: ${invalid.join(", ")}`)
      exit(1)
      return { commitCount, pushed: false, pushFailed: false }
    }

    if (!args.dryRun) {
      const result = run(["add", ...intent.files], root)
      if (!check(result, error, exit)) return { commitCount, pushed: false, pushFailed: false }
    }

    let msg = messageForIntent(intent, args.lockTemplate)
    let prev = args.previous
    if (!msg) {
      const result = await gen({
        path: root,
        selectedFiles: nonLockFiles(intent.files),
        previousMessage: prev,
        prompt: args.prompt,
        model: args.model,
        instance: args.instance,
        intent: { files: intent.files, description: intent.description },
      })
      msg = result.message
    }
    if (!msg?.trim()) {
      error("Commit message is empty")
      exit(1)
      return { commitCount, pushed: false, pushFailed: false }
    }

    while (true) {
      if (args.dryRun) {
        out("")
        out(ui.commitMessageBlock(msg))
        out(ui.warn("Dry run: commit not created"))
        break
      }

      if (args.confirm) {
        out("")
        out(ui.commitMessageBlock(msg))
        const action = await (args.selectAction ?? selectAction)(msg, intent, index + 1, intents.length)
        if (action === "cancel") {
          out(ui.info("Cancelled"))
          return { commitCount, pushed: false, pushFailed: false }
        }
        if (action === "edit") {
          const next = await (args.edit ?? edit)(msg)
          if (!next) {
            out(ui.info("Cancelled"))
            return { commitCount, pushed: false, pushFailed: false }
          }
          msg = next
          continue
        }
        if (action === "regenerate") {
          prev = msg
          const result = await gen({
            path: root,
            selectedFiles: nonLockFiles(intent.files),
            previousMessage: prev,
            prompt: args.prompt,
            model: args.model,
            instance: args.instance,
            intent: { files: intent.files, description: intent.description },
          })
          msg = result.message
          continue
        }
      }

      if (!args.confirm) out(ui.intentHeader(index + 1, intents.length, msg, intent.files))

      const diff = run(["diff", "--cached", "--quiet"], root)
      if (diff.code === 0) {
        error("No staged changes found")
        exit(1)
        return { commitCount, pushed: false, pushFailed: false }
      }
      if (diff.code !== 1) {
        check(diff, error, exit)
        return { commitCount, pushed: false, pushFailed: false }
      }

      const result = run(["commit", "-m", msg], root)
      if (!check(result, error, exit)) return { commitCount, pushed: false, pushFailed: false }
      const text = result.stdout.trim()
      if (text) out(ui.gitCommitOutput(text))
      if (!text) out(ui.committed(index + 1, intents.length))
      committed = true
      commitCount++
      break
    }
  }

  const pushFailed = args.push === true && committed
  const pushed = pushFailed ? runPush(run, root, out, error, exit, ui) : false
  if (commitCount > 0) {
    out(ui.summary(commitCount, pushed ? "succeeded" : pushFailed ? "failed" : "skipped"))
  }
  return { commitCount, pushed, pushFailed: pushFailed && !pushed }
}

function fastCommitBuilder(yargs: Argv) {
  return yargs
    .option("dir", { type: "string", describe: "directory to run in" })
    .option("confirm", { type: "boolean", describe: "confirm each commit interactively" })
    .option("dry-run", { type: "boolean", describe: "preview without creating commits" })
    .option("staged-only", { type: "boolean", describe: "only commit already staged files" })
    .option("previous", { type: "string", describe: "previous message to avoid when regenerating" })
}

export const FastCommitCommand = effectCmd<CliArgs, void>({
  command: "fast-commit",
  describe: "split changes into commits with AI-generated Chinese messages",
  directory: (args) => invocationDirectory(args.dir),
  builder: fastCommitBuilder,
  handler: Effect.fn("Cli.fastCommit")(function* (args) {
    const cfg = yield* Config.Service.use((svc) => svc.get())
    const instance = yield* InstanceRef
    const root = invocationDirectory(args.dir)
    const style = yield* Effect.promise(() => resolveCliStyle({ directory: root }))
    yield* Effect.promise(() =>
      handleFastCommit({
        dir: args.dir,
        confirm: args.confirm,
        dryRun: args["dry-run"],
        stagedOnly: args["staged-only"],
        previous: args.previous,
        prompt: cfg.commit_message?.prompt || FAST_COMMIT_SYSTEM_PROMPT,
        model: cfg.commit_message?.model,
        lockTemplate: cfg.commit_message?.lock_template,
        instance,
        style,
      }),
    )
  }),
})

export const FastCommitAndPushCommand = effectCmd<CliArgs, void>({
  command: "fast-commit-and-push",
  describe: "fast-commit then push when commits were created",
  directory: (args) => invocationDirectory(args.dir),
  builder: fastCommitBuilder,
  handler: Effect.fn("Cli.fastCommitAndPush")(function* (args) {
    const cfg = yield* Config.Service.use((svc) => svc.get())
    const instance = yield* InstanceRef
    const root = invocationDirectory(args.dir)
    const style = yield* Effect.promise(() => resolveCliStyle({ directory: root }))
    yield* Effect.promise(() =>
      handleFastCommit({
        dir: args.dir,
        push: true,
        confirm: args.confirm,
        dryRun: args["dry-run"],
        stagedOnly: args["staged-only"],
        previous: args.previous,
        prompt: cfg.commit_message?.prompt || FAST_COMMIT_SYSTEM_PROMPT,
        model: cfg.commit_message?.model,
        lockTemplate: cfg.commit_message?.lock_template,
        instance,
        style,
      }),
    )
  }),
})
