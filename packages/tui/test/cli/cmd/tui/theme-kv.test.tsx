/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { tmpdir } from "../../../fixture/fixture"
import { createTuiResolvedConfig } from "../../../fixture/tui-runtime"
import { TestTuiContexts } from "../../../fixture/tui-environment"
import { KVProvider, useKV } from "../../../../src/context/kv"
import { ThemeProvider, useTheme } from "../../../../src/context/theme"
import { TuiConfigProvider } from "../../../../src/config"

test("restores saved theme from kv.json on startup", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, JSON.stringify({ theme: "dracula" }))

  let selected = ""
  let saved: unknown
  function Probe() {
    onMount(() => {
      selected = useTheme().selected
      saved = useKV().get("theme")
    })
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={{ state: tmp.path }}>
      <TuiConfigProvider config={createTuiResolvedConfig({})}>
        <KVProvider>
          <ThemeProvider mode="dark">
            <Probe />
          </ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    </TestTuiContexts>
  ))

  try {
    expect(selected).toBe("dracula")
    expect(saved).toBe("dracula")
  } finally {
    app.renderer.destroy()
  }
})
