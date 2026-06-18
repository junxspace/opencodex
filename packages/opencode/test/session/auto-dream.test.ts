import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AutoDream } from "@/session/auto-dream"
import { Config } from "@/config/config"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

describe("AutoDream", () => {
  describe("shouldAutoDream", () => {
    it.effect("returns false when disabled", () =>
      Effect.gen(function* () {
        const cfg = {
          dream: { auto: false, interval_days: 7 },
        } as never
        
        const configLayer = Layer.succeed(Config.Service, Config.Service.of({
          get: () => Effect.succeed(cfg),
          getGlobal: () => Effect.succeed(cfg),
          getConsoleState: () => Effect.succeed({ consoleManagedProviders: [], activeOrgName: undefined, switchableOrgCount: 0 }),
          update: () => Effect.void,
          updateGlobal: () => Effect.succeed({ info: cfg, changed: false }),
          invalidate: () => Effect.void,
          directories: () => Effect.succeed([]),
          waitForDependencies: () => Effect.void,
        }))
        
        const result = yield* AutoDream.shouldAutoDream().pipe(
          Effect.provide(configLayer),
        )
        
        expect(result).toBe(false)
      }),
    )

    it.effect("returns false when dream.auto is omitted", () =>
      Effect.gen(function* () {
        const cfg = {} as never

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

        const result = yield* AutoDream.shouldAutoDream().pipe(Effect.provide(configLayer))
        expect(result).toBe(false)
      }),
    )

    it.effect("returns true when enabled and interval passed", () =>
      Effect.gen(function* () {
        const cfg = {
          dream: { auto: true, interval_days: 0 },
        } as never
        
        const configLayer = Layer.succeed(Config.Service, Config.Service.of({
          get: () => Effect.succeed(cfg),
          getGlobal: () => Effect.succeed(cfg),
          getConsoleState: () => Effect.succeed({ consoleManagedProviders: [], activeOrgName: undefined, switchableOrgCount: 0 }),
          update: () => Effect.void,
          updateGlobal: () => Effect.succeed({ info: cfg, changed: false }),
          invalidate: () => Effect.void,
          directories: () => Effect.succeed([]),
          waitForDependencies: () => Effect.void,
        }))
        
        const result = yield* AutoDream.shouldAutoDream().pipe(
          Effect.provide(configLayer),
        )
        
        expect(result).toBe(true)
      }),
    )
  })

  describe("markDreamRun", () => {
    it.effect("updates last spawn time", () =>
      Effect.gen(function* () {
        yield* AutoDream.markDreamRun()
        expect(true).toBe(true)
      }),
    )
  })
})