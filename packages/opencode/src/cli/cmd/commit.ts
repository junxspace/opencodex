import type { Argv } from "yargs"
import * as prompts from "@clack/prompts"
import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { resolveCliStyle, type CliStyle } from "../theme"
import { UI } from "../ui"
import { Config } from "@/config/config"
import { InstanceRef } from "@/effect/instance-ref"
import { invocationDirectory } from "../invocation-directory"
import { generateCommitMessage } from "@/commit-message"
import { getGitContext, isLockFile } from "@/commit-message/git-context"
import type { CommitMessageRequest } from "@/commit-message/types"

export type Status = {
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

type GitResult = {
  code: number
  stdout: string
  stderr: string
}

type Action = "commit" | "edit" | "regenerate" | "cancel"
type PushAction = "push" | "cancel"
type Intent = {
  files: string[]
  description: string
}
type IntentResult = {
  intents: Intent[]
}

type Args = {
  dir?: string
  all?: boolean
  includeUntracked?: boolean
  message?: string
  yes?: boolean
  push?: boolean
  dryRun?: boolean
  previous?: string
  prompt?: string
  model?: string
  instance?: CommitMessageRequest["instance"]
  git?: (args: string[], cwd: string) => GitResult
  generate?: typeof generateCommitMessage
  analyzeIntent?: (input: { path: string; selectedFiles: string[] }) => Promise<IntentResult>
  selectAction?: (message: string, intent?: Intent) => Promise<Action>
  selectPush?: () => Promise<PushAction>
  edit?: (message: string) => Promise<string | undefined>
  output?: (text: string) => void
  error?: (text: string) => void
  exit?: (code: number) => void
  style?: CliStyle
}

type CliArgs = {
  dir?: string
  all?: boolean
  "include-untracked"?: boolean
  message?: string
  previous?: string
  yes?: boolean
  push?: boolean
  "dry-run"?: boolean
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

function commitUi(style: CliStyle) {
  const styled = (text: string) => text + style.TEXT_NORMAL

  return {
    styled,
    statusSection(title: string, files: string[]) {
      const header = styled(`${style.TEXT_DIM_BOLD}${title}${style.TEXT_NORMAL}`)
      if (files.length === 0) return `${header}\n${styled(`${style.TEXT_DIM}  none`)}`
      const items = files.map((file) => {
        const path = isLockFile(file) ? `${style.TEXT_DIM}  ${file}` : `  ${file}`
        return styled(path)
      })
      return `${header}\n${items.join("\n")}`
    },
    commitMessageBlock(message: string) {
      const [subject = "", ...body] = message.trim().split("\n")
      return [
        styled(`${style.TEXT_DIM_BOLD}Generated commit message${style.TEXT_NORMAL}`),
        styled(`${style.TEXT_SUCCESS_BOLD}${subject}${style.TEXT_NORMAL}`),
        ...body
          .filter((line) => line.trim())
          .map((line) => styled(`${style.TEXT_DIM}  ${line}${style.TEXT_NORMAL}`)),
      ].join("\n")
    },
    gitOutput(text: string) {
      return text
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => styled(`${style.TEXT_DIM}${line}${style.TEXT_NORMAL}`))
        .join("\n")
    },
    success(text: string) {
      return styled(`${style.TEXT_SUCCESS_BOLD}${text}${style.TEXT_NORMAL}`)
    },
    info(text: string) {
      return styled(`${style.TEXT_DIM}${text}${style.TEXT_NORMAL}`)
    },
  }
}

function empty(status: Status) {
  return status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0
}

function files(status: Status) {
  return [...new Set([...status.staged, ...status.unstaged, ...status.untracked])]
}

export function resolveStageOptions(
  status: Status,
  options: { all?: boolean; includeUntracked?: boolean; yes?: boolean; push?: boolean },
) {
  const autoAll = status.staged.length === 0 && (options.yes === true || options.push === true)
  return {
    all: options.all === true || autoAll,
    includeUntracked: options.includeUntracked === true,
  }
}

export function intentFiles(status: Status, options: { all?: boolean; includeUntracked?: boolean }) {
  if (status.staged.length > 0) return status.staged
  if (options.all) return files(status)
  if (options.includeUntracked) return [...new Set([...status.unstaged, ...status.untracked])]
  return []
}

export function noCommittableMessage(
  status: Status,
  options: { all?: boolean; includeUntracked?: boolean },
  selected: string[],
) {
  if (status.staged.length === 0 && !options.all && !options.includeUntracked) {
    return "No staged changes. Stage files with git add or pass --all to include unstaged changes."
  }
  if (selected.length > 0 && selected.every(isLockFile)) {
    return "Only lock file changes found. Lock files are excluded from AI commit generation."
  }
  return "No committable changes found."
}

async function analyze(input: { path: string; selectedFiles: string[] }): Promise<IntentResult> {
  const ctx = await getGitContext(input.path, input.selectedFiles)
  const commitFiles = ctx.files.map((file) => file.path)
  if (commitFiles.length === 0) return { intents: [] }
  return {
    intents: [
      {
        files: commitFiles,
        description: "commit related changes",
      },
    ],
  }
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
  ui: ReturnType<typeof commitUi>,
) {
  const result = run(["push"], root)
  if (!check(result, error, exit)) return false
  const text = result.stdout.trim()
  if (text) out(ui.gitOutput(text))
  out(ui.success("Pushed"))
  return true
}

async function selectPush(): Promise<PushAction> {
  const result = await prompts.select({
    message: "No changes found. Push current branch?",
    options: [
      { value: "push", label: "Push" },
      { value: "cancel", label: "Cancel" },
    ],
  })
  if (prompts.isCancel(result)) return "cancel"
  return result as PushAction
}

const PREVIEW_FILE_LIMIT = 15

function section(title: string, body: string) {
  return `${title}\n${body}`
}

function previewFiles(files: string[]) {
  if (files.length <= PREVIEW_FILE_LIMIT) return files.map((file) => `  ${file}`).join("\n")
  const shown = files.slice(0, PREVIEW_FILE_LIMIT).map((file) => `  ${file}`)
  shown.push(`  ... and ${files.length - PREVIEW_FILE_LIMIT} more`)
  return shown.join("\n")
}

export function preview(message: string, intent?: Intent) {
  const [subject = "", ...body] = message.trim().split("\n")
  const parts = [
    section("Commit message", [`  ${subject}`, ...body.filter((line) => line.trim()).map((line) => `  ${line}`)].join("\n")),
  ]
  if (intent) {
    parts.push(section("Files to commit", previewFiles(intent.files)))
  }
  return parts.join("\n\n")
}

async function selectAction(message: string, intent?: Intent): Promise<Action> {
  prompts.note(preview(message, intent), "Commit preview")
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

export async function handle(args: Args) {
  const root = invocationDirectory(args.dir)
  const run = args.git ?? git
  const out = args.output ?? ((text: string) => process.stdout.write(text + "\n"))
  const error = args.error ?? UI.error
  const exit = args.exit ?? ((code: number) => (process.exitCode = code))
  const ui = commitUi(args.style ?? (await resolveCliStyle({ directory: root })))
  const statusResult = run(["status", "--porcelain"], root)
  if (!check(statusResult, error, exit)) return

  const status = parseStatus(statusResult.stdout)
  out(ui.statusSection("Staged changes", status.staged))
  out(ui.statusSection("Unstaged changes", status.unstaged))
  out(ui.statusSection("Untracked files", status.untracked))

  if (empty(status)) {
    out(ui.info("No changes found"))
    const action = args.yes ? "push" : await (args.selectPush ?? selectPush)()
    if (action === "cancel") {
      out(ui.info("Cancelled"))
      return
    }
    if (!runPush(run, root, out, error, exit, ui)) return
    return
  }

  const unstaged = run(["diff"], root)
  if (!check(unstaged, error, exit)) return
  const staged = run(["diff", "--staged"], root)
  if (!check(staged, error, exit)) return

  const stageOptions = resolveStageOptions(status, {
    all: args.all,
    includeUntracked: args.includeUntracked,
    yes: args.yes,
    push: args.push,
  })
  const selected = intentFiles(status, stageOptions)
  const committable = selected.filter((file) => !isLockFile(file))
  if (committable.length === 0) {
    error(noCommittableMessage(status, stageOptions, selected))
    exit(1)
    return
  }

  const analysis = await (args.analyzeIntent ?? analyze)({ path: root, selectedFiles: committable })
  const intents = analysis.intents.filter((intent) => intent.files.length > 0)
  if (intents.length === 0) {
    error(noCommittableMessage(status, stageOptions, selected))
    exit(1)
    return
  }

  if (!args.dryRun) {
    const reset = run(["reset"], root)
    if (!check(reset, error, exit)) return
  }

  const gen = args.generate ?? generateCommitMessage
  let committed = false
  for (const intent of intents) {
    const known = new Set(files(status))
    const invalid = intent.files.filter((file) => !known.has(file))
    if (invalid.length > 0) {
      error(`Intent references files that are not changed: ${invalid.join(", ")}`)
      exit(1)
      return
    }

    if (!args.dryRun) {
      const result = run(["add", ...intent.files], root)
      if (!check(result, error, exit)) return
    }

    let msg = args.message ?? intent.description
    let prev = args.previous
    if (!args.message) {
      const result = await gen({
        path: root,
        selectedFiles: intent.files,
        previousMessage: prev,
        prompt: args.prompt,
        model: args.model,
        instance: args.instance,
        intent,
      })
      msg = result.message
    }
    if (!msg) {
      error("Commit message is empty")
      exit(1)
      return
    }

    while (true) {
      if (!msg.trim()) {
        error("Commit message is empty")
        exit(1)
        return
      }

      if (args.yes || args.dryRun) {
        out("")
        out(ui.commitMessageBlock(msg))
      }

      const action = args.yes || args.dryRun ? "commit" : await (args.selectAction ?? selectAction)(msg, intent)
      if (action === "cancel") {
        out(ui.info("Cancelled"))
        return
      }
      if (action === "edit") {
        const next = await (args.edit ?? edit)(msg)
        if (!next) {
          out(ui.info("Cancelled"))
          return
        }
        msg = next
        continue
      }
      if (action === "regenerate") {
        prev = msg
        const result = await gen({
          path: root,
          selectedFiles: intent.files,
          previousMessage: prev,
          prompt: args.prompt,
          model: args.model,
          intent,
        })
        msg = result.message
        continue
      }

      if (args.dryRun) {
        out(ui.info("Dry run: commit not created"))
        if (args.push) out(ui.info("Dry run: push skipped"))
        break
      }

      const diff = run(["diff", "--cached", "--quiet"], root)
      if (diff.code === 0) {
        error("No staged changes found")
        exit(1)
        return
      }
      if (diff.code !== 1) {
        check(diff, error, exit)
        return
      }

      const result = run(["commit", "-m", msg], root)
      if (!check(result, error, exit)) return
      out("")
      const text = result.stdout.trim()
      if (text) out(ui.gitOutput(text))
      if (!text) out(ui.success("Committed"))
      committed = true
      break
    }
  }

  if (args.push && committed) runPush(run, root, out, error, exit, ui)
}

export const CommitCommand = effectCmd<CliArgs, void>({
  command: "commit",
  describe: "generate a commit message and commit staged changes",
  directory: (args) => invocationDirectory(args.dir),
  builder: (yargs: Argv) =>
    yargs
      .option("dir", {
        type: "string",
        describe: "directory to run in",
      })
      .option("all", {
        type: "boolean",
        describe: "stage tracked changes when nothing is staged",
      })
      .option("include-untracked", {
        type: "boolean",
        describe: "stage all changes, including untracked files, when nothing is staged",
      })
      .option("message", {
        type: "string",
        describe: "commit with this message instead of generating one",
      })
      .option("previous", {
        type: "string",
        describe: "previous generated message to avoid when regenerating",
      })
      .option("yes", {
        type: "boolean",
        describe: "commit without confirmation",
      })
      .option("push", {
        type: "boolean",
        describe: "push the branch after committing",
      })
      .option("dry-run", {
        type: "boolean",
        describe: "show message without creating a commit",
      }),
  handler: Effect.fn("Cli.commit")(function* (args) {
    const cfg = yield* Config.Service.use((svc) => svc.get())
    const instance = yield* InstanceRef
    const root = invocationDirectory(args.dir)
    const style = yield* Effect.promise(() => resolveCliStyle({ directory: root }))
    yield* Effect.promise(() =>
      handle({
        dir: args.dir,
        all: args.all,
        includeUntracked: args["include-untracked"],
        message: args.message,
        previous: args.previous,
        yes: args.yes,
        push: args.push,
        dryRun: args["dry-run"],
        prompt: cfg.commit_message?.prompt || undefined,
        model: cfg.commit_message?.model,
        instance,
        style,
      }),
    )
  }),
})
