/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal, type JSX } from "solid-js"
import { handleFastCommit, type FastCommitResult } from "@/cli/cmd/fast-commit"
import { resolveCliStyle } from "@/cli/theme"
import type { CommitIntent } from "@/commit-message/analyze-intents"
import { Config } from "@/config/config"
import { FAST_COMMIT_SYSTEM_PROMPT } from "@/commit-message/prompt"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import type { InstanceContext } from "@/project/instance-context"
import { Effect } from "effect"

type Action = "commit" | "edit" | "regenerate" | "cancel"

type Item = {
  title: string
  value: Action
  description?: string
}

const id = "internal:opencode-fast-commit"

function message(err: unknown) {
  if (err && typeof err === "object" && "_tag" in err) {
    const fields = Object.entries(err as Record<string, unknown>)
      .filter(([k]) => k !== "_tag" && k !== "stack")
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ")
    return fields ? `${err._tag}: ${fields}` : String(err._tag)
  }
  if (err instanceof Error) return err.message
  return String(err)
}

function plainText(text: string) {
  return text.replace(/\x1b\[[0-9;]*m/g, "")
}

function statusOverviewLine(line: string) {
  const trimmed = plainText(line).trim()
  if (!trimmed) return false
  if (trimmed.includes("⚡ fast-commit")) return true
  if (trimmed.includes("working tree")) return true
  if (trimmed.startsWith("📦") || trimmed.startsWith("📝") || trimmed.startsWith("✨")) return true
  if (trimmed.startsWith("· ") || trimmed.startsWith("🔒 ")) return true
  if (trimmed === "· none") return true
  if (/^─{8,}$/.test(trimmed)) return true
  return false
}

function dialogMessage(lines: string[], errors: string[], result: FastCommitResult) {
  if (result.pushFailed && result.commitCount > 0) {
    const body = errors.map(plainText).join("\n\n").trim()
    return [
      `已创建 ${result.commitCount} 个 commit（仅保存在本地）。`,
      "",
      body ? `推送失败：\n${body}` : "推送失败。",
      "",
      "请修复上述问题后重新运行 git push。",
    ]
      .join("\n")
      .trim()
  }

  const filtered = lines.filter((line) => {
    if (!line.trim()) return false
    return !statusOverviewLine(line)
  })
  const parts = errors.length > 0 ? [...errors.map(plainText), ...filtered.map(plainText)] : filtered.map(plainText)
  const text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  return text || plainText(lines.join("\n")).trim()
}

function resultTitle(title: string, result: FastCommitResult, failed: boolean) {
  if (result.pushFailed && result.commitCount > 0) return "提交成功，推送失败"
  if (failed) return `${title} failed`
  return title
}

function alert(api: TuiPluginApi, title: string, message: string) {
  return new Promise<void>((resolve) => {
    let done = false
    api.ui.dialog.setSize("xlarge")
    api.ui.dialog.replace(
      () =>
        api.ui.DialogAlert({
          title,
          message,
          onConfirm() {
            done = true
            api.ui.dialog.clear()
            resolve()
          },
        }),
      () => {
        if (done) return
        done = true
        api.ui.dialog.clear()
        resolve()
      },
    )
  })
}

function prompt(
  api: TuiPluginApi,
  title: string,
  opts?: { value?: string; placeholder?: string; description?: () => JSX.Element },
) {
  return new Promise<string | null>((resolve) => {
    let done = false
    api.ui.dialog.replace(
      () =>
        api.ui.DialogPrompt({
          title,
          value: opts?.value,
          placeholder: opts?.placeholder,
          description: opts?.description,
          onConfirm(value) {
            done = true
            api.ui.dialog.clear()
            resolve(value)
          },
          onCancel() {
            done = true
            api.ui.dialog.clear()
            resolve(null)
          },
        }),
      () => {
        if (done) return
        done = true
        resolve(null)
      },
    )
  })
}

function select(api: TuiPluginApi, msg: string, intent: CommitIntent, index: number, total: number) {
  const options: Item[] = [
    { title: "Commit", value: "commit", description: "Create the commit" },
    { title: "Edit", value: "edit", description: "Edit the generated message" },
    { title: "Regenerate", value: "regenerate", description: "Generate a different message" },
    { title: "Cancel", value: "cancel" },
  ]
  return new Promise<Action>((resolve) => {
    let done = false
    api.ui.dialog.replace(
      () =>
        api.ui.DialogSelect({
          title: `Commit this change? (${index}/${total})`,
          options,
          onSelect(item) {
            done = true
            api.ui.dialog.clear()
            resolve(item.value)
          },
        }),
      () => {
        if (done) return
        done = true
        resolve("cancel")
      },
    )
    const files = intent.files.length ? `\nFiles: ${intent.files.join(", ")}` : ""
    api.ui.toast({ variant: "info", message: `Commit message: ${msg.split("\n")[0]}${files}`, duration: 10_000 })
  })
}

async function run(api: TuiPluginApi, push: boolean, confirm: boolean) {
  const dir = api.state.path.directory || process.cwd()
  const title = push ? "Fast commit & push" : "Fast commit"
  const lines: string[] = []
  const errors: string[] = []
  let failed = false
  const output = (text: string) => {
    if (!text.trim()) return
    lines.push(text)
  }

  api.ui.toast({ variant: "info", message: `正在执行 ${title}...`, duration: 120_000 })

  let result: FastCommitResult = { commitCount: 0, pushed: false, pushFailed: false }

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const store = yield* InstanceStore.Service
      const ctx = yield* store.load({ directory: dir })
      const cfg = yield* Config.Service.use((svc) => svc.get()).pipe(Effect.provideService(InstanceRef, ctx))
      const style = yield* Effect.promise(() => resolveCliStyle({ directory: dir, force: false }))
      result = yield* Effect.promise(() =>
        handleFastCommit({
          dir,
          push,
          confirm,
          style,
          output,
          error: (text) => {
            failed = true
            errors.push(text)
          },
          exit: () => {},
          onProgress: (current, total, intent) => {
            const desc = intent.description ? ` · ${intent.description}` : ""
            api.ui.toast({ variant: "info", message: `正在提交 ${current}/${total}${desc}`, duration: 120_000 })
          },
          selectAction: (msg, intent, index, total) => select(api, msg, intent, index, total),
          edit: (msg) =>
            prompt(api, "Edit commit message", { value: msg, placeholder: "Commit message" }).then((value) =>
              value?.trim(),
            ),
          prompt: cfg.commit_message?.prompt || FAST_COMMIT_SYSTEM_PROMPT,
          model: cfg.commit_message?.model,
          lockTemplate: cfg.commit_message?.lock_template,
          instance: ctx as InstanceContext,
        }),
      )
      yield* store.dispose(ctx)
    }),
  )

  if (lines.length > 0 || errors.length > 0 || result.commitCount > 0) {
    await alert(api, resultTitle(title, result, failed), dialogMessage(lines, errors, result))
  }

  if (result.pushFailed && result.commitCount > 0) {
    api.ui.toast({
      variant: "warning",
      message: `已提交 ${result.commitCount} 个更改，但推送失败`,
      duration: 5000,
    })
    return
  }

  if (!failed && result.commitCount > 0) {
    api.ui.toast({
      variant: "success",
      message: push ? `已提交 ${result.commitCount} 个更改并推送` : `已提交 ${result.commitCount} 个更改`,
      duration: 3000,
    })
  }
}

function register(api: TuiPluginApi, name: string, title: string, slashName: string, push: boolean) {
  const [busy, setBusy] = createSignal(false)
  api.keymap.registerLayer({
    commands: [
      {
        name,
        title,
        desc: title,
        category: "Git",
        namespace: "palette",
        slashName,
        enabled: () => !busy(),
        run() {
          if (busy()) return
          setBusy(true)
          void run(api, push, false)
            .then(() => {
              api.ui.dialog.clear()
            })
            .catch((err) => {
              void alert(api, "Fast commit failed", message(err))
            })
            .finally(() => {
              setBusy(false)
            })
        },
      },
    ],
    bindings: api.tuiConfig.keybinds.gather(name, [name]),
  })
}

const tui: TuiPlugin = async (api) => {
  register(api, "opencode.fast-commit", "Fast commit changes", "fast-commit", false)
  register(api, "opencode.fast-commit-and-push", "Fast commit and push", "fast-commit-and-push", true)
}

const plugin: TuiPluginModule & { id: string } = { id, tui }

export default plugin
