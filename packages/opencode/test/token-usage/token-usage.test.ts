import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { testEffect } from "../lib/effect"
import { AppProcess, AppProcessError } from "@opencode-ai/core/process"
import { TokenUsage } from "@/token-usage/token-usage"
import { Config } from "@/config/config"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { InstanceRef } from "@/effect/instance-ref"

const sampleConfig = {
  token_usage: {
    ok: {
      command: [
        process.execPath,
        "-e",
        "process.stdout.write(JSON.stringify({five_hour:{used_percent:42,reset_at:Date.now()+3600_000},weekly:{used_percent:21,reset_at:Date.now()+7*24*3600_000}}))",
      ],
      refresh_interval: 60,
    },
    fail: {
      command: [process.execPath, "-e", "process.exit(1)"],
      refresh_interval: 60,
    },
    bad: {
      command: [process.execPath, "-e", "process.stdout.write('not json')"],
      refresh_interval: 60,
    },
  },
} as unknown as ConfigV1.Info

function makeConfigStub(value: ConfigV1.Info) {
  return Layer.succeed(
    Config.Service,
    Config.Service.of({
      get: () => Effect.succeed(value),
      getGlobal: () => Effect.succeed(value),
      getConsoleState: () =>
        Effect.succeed({ consoleManagedProviders: [], switchableOrgCount: 0 }),
      update: () => Effect.void,
      updateGlobal: () => Effect.succeed({ info: value, changed: false }),
      invalidate: () => Effect.void,
      directories: () => Effect.succeed([]),
      waitForDependencies: () => Effect.void,
    }),
  )
}

const baseLayer = TokenUsage.layer.pipe(
  Layer.provide(makeConfigStub(sampleConfig)),
  Layer.provide(AppProcess.defaultLayer),
  Layer.provide(Layer.succeed(InstanceRef, undefined)),
)

const it = testEffect(baseLayer)

describe("TokenUsage", () => {
  it.live(
    "returns undefined when no adapter is configured for the provider",
    Effect.gen(function* () {
      const svc = yield* TokenUsage.Service
      const result = yield* svc.get(ProviderV2.ID.make("not-configured"))
      expect(result).toBeUndefined()
    }),
  )

  it.live(
    "runs the adapter and caches the snapshot",
    Effect.gen(function* () {
      const svc = yield* TokenUsage.Service
      const result = yield* svc.refresh(ProviderV2.ID.make("ok"))
      expect(result?.five_hour?.used_percent).toBe(42)
      expect(result?.weekly?.used_percent).toBe(21)
      const cached = yield* svc.get(ProviderV2.ID.make("ok"))
      expect(cached?.five_hour?.used_percent).toBe(42)
    }),
  )

  it.live(
    "records an error message and returns undefined when the adapter exits non-zero",
    Effect.gen(function* () {
      const svc = yield* TokenUsage.Service
      const result = yield* svc.refresh(ProviderV2.ID.make("fail"))
      expect(result).toBeUndefined()
      const cached = yield* svc.get(ProviderV2.ID.make("fail"))
      expect(cached?.error).toBeDefined()
    }),
  )

  it.live(
    "records an error when the adapter output is not valid JSON",
    Effect.gen(function* () {
      const svc = yield* TokenUsage.Service
      const result = yield* svc.refresh(ProviderV2.ID.make("bad"))
      expect(result).toBeUndefined()
      const cached = yield* svc.get(ProviderV2.ID.make("bad"))
      expect(cached?.error).toContain("JSON")
    }),
  )

  it.live(
    "returns the configured provider IDs",
    Effect.gen(function* () {
      const svc = yield* TokenUsage.Service
      const ids = yield* svc.configured()
      expect(ids).toContain(ProviderV2.ID.make("ok"))
      expect(ids).toContain(ProviderV2.ID.make("fail"))
    }),
  )

  it.live(
    "describes AppProcessError with a useful message",
    Effect.gen(function* () {
      const message = TokenUsage._testing.describeError(
        new AppProcessError({ command: "x", exitCode: 7 }),
      )
      expect(message).toContain("7")
    }),
  )
})
