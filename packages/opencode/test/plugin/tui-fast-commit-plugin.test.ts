import { expect, test } from "bun:test"
import FastCommitPlugin from "../../src/plugin/tui/fast-commit"
import { createTuiPluginApi } from "../fixture/tui-plugin"

test("fast-commit plugin registers slash commands", async () => {
  const layers: Array<{ commands?: Array<Record<string, unknown>> }> = []
  const api = createTuiPluginApi({
    keymap: {
      registerLayer(layer) {
        layers.push(layer as { commands?: Array<Record<string, unknown>> })
        return () => {}
      },
    } as NonNullable<Parameters<typeof createTuiPluginApi>[0]>["keymap"],
  })

  await FastCommitPlugin.tui(api, undefined, {
    id: "internal:opencode-fast-commit",
    source: "internal",
    spec: "internal:opencode-fast-commit",
    target: "internal:opencode-fast-commit",
    first_time: 0,
    last_time: 0,
    time_changed: 0,
    load_count: 1,
    fingerprint: "test",
    state: "same",
  })

  const commands = layers.flatMap((layer) => layer.commands ?? [])
  expect(commands.find((item) => item.name === "opencode.fast-commit")).toMatchObject({
    title: "Fast commit changes",
    category: "Git",
    namespace: "palette",
    slashName: "fast-commit",
  })
  expect(commands.find((item) => item.name === "opencode.fast-commit-and-push")).toMatchObject({
    slashName: "fast-commit-and-push",
  })
})
