/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal, type JSX } from "solid-js"
import { handleFastCommit } from "@/cli/cmd/fast-commit"
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
  if (err instanceof Error) return err.message
  return String(err)
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
  const output = (text: string) => {
    if (!text.trim()) return
    api.ui.toast({ variant: "info", message: text, duration: 3000 })
  }

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const store = yield* InstanceStore.Service
      const ctx = yield* store.load({ directory: dir })
      const cfg = yield* Config.Service.use((svc) => svc.get()).pipe(Effect.provideService(InstanceRef, ctx))
      yield* Effect.promise(() =>
        handleFastCommit({
          dir,
          push,
          confirm,
          output,
          error: (text) => api.ui.toast({ variant: "error", message: text }),
          exit: () => {},
          onProgress: (current, total) => {
            api.ui.toast({ variant: "info", message: `正在提交 ${current}/${total}`, duration: 2000 })
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
              api.ui.toast({ variant: "error", message: message(err) })
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
