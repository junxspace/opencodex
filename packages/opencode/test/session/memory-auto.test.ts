import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import * as SearchConfig from "@opencode-ai/core/memory/search-config"
import { MemoryAuto } from "@/session/memory-auto"
import { Config } from "@/config/config"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

describe("MemoryAuto", () => {
  test("tokenRatio uses model context limit", () => {
    const ratio = MemoryAuto.tokenRatio({
      tokens: { input: 850, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, total: 850 },
      model: { limit: { context: 1000 } } as never,
    })
    expect(ratio).toBe(0.85)
    expect(MemoryAuto.shouldCheckpoint(ratio)).toBe(true)
  })

  test("detects opencode-working-memory plugin", () => {
    expect(
      MemoryAuto.hasWorkingMemoryPlugin({
        plugin: ["@tarquinen/opencode-dcp", "opencode-working-memory"],
      }),
    ).toBe(true)
    expect(MemoryAuto.rememberAutoEnabled({ plugin: ["opencode-working-memory"], remember: { auto: true } })).toBe(
      false,
    )
  })

  test("consumeAutoCheckpoint debounces repeated triggers", () => {
    const input = {
      sessionID: "ses_cp_debounce" as never,
      tokens: { input: 900, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, total: 900 },
      model: { limit: { context: 1000 } } as never,
    }
    expect(MemoryAuto.consumeAutoCheckpoint(input)).toBe(true)
    expect(MemoryAuto.consumeAutoCheckpoint(input)).toBe(false)
    expect(
      MemoryAuto.consumeAutoCheckpoint({
        ...input,
        tokens: { ...input.tokens, total: 9000, input: 9000 },
      }),
    ).toBe(true)
  })

  test("consumeAutoCheckpoint ignores ratios below threshold", () => {
    expect(
      MemoryAuto.consumeAutoCheckpoint({
        sessionID: "ses_low" as never,
        tokens: { input: 500, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, total: 500 },
        model: { limit: { context: 1000 } } as never,
      }),
    ).toBe(false)
  })

  it.effect("applyRuntimeConfig sets memory search score floor", () =>
    Effect.gen(function* () {
      const cfg = { checkpoint: { memory_search_score_floor: 0.25 } }
      const configLayer = Layer.succeed(
        Config.Service,
        Config.Service.of({
          get: () => Effect.succeed(cfg),
          getGlobal: () => Effect.succeed(cfg),
          getConsoleState: () =>
            Effect.succeed({ consoleManagedProviders: [], activeOrgName: undefined, switchableOrgCount: 0 }),
          update: () => Effect.void,
          updateGlobal: () => Effect.succeed({ info: cfg, changed: false }),
          invalidate: () => Effect.void,
          directories: () => Effect.succeed([]),
          waitForDependencies: () => Effect.void,
        }),
      )

      yield* MemoryAuto.applyRuntimeConfig().pipe(Effect.provide(configLayer))
      expect(SearchConfig.scoreFloorRatio).toBe(0.25)
    }),
  )
})
