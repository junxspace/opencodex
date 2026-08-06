export * as TokenUsage from "./token-usage"

import { Cause, Clock, Duration, Effect, Layer, Ref, Schema, Schedule, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Config } from "@/config/config"
import { AppProcess, AppProcessError } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Context } from "effect"

const DEFAULT_REFRESH_SECONDS = 60
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_OUTPUT_BYTES = 64 * 1024

export const Window = Schema.Struct({
  used_percent: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100)).annotate({
    description: "Percentage of the current usage window that has been consumed (0-100).",
  }),
  reset_at: Schema.Number.check(Schema.isFinite()).annotate({
    description: "Epoch milliseconds (UTC) at which this window resets.",
  }),
}).annotate({ identifier: "TokenUsageWindow" })
export type Window = Schema.Schema.Type<typeof Window>

export const Usage = Schema.Struct({
  provider_id: Schema.String.annotate({ description: "Provider ID this usage entry belongs to." }),
  refreshed_at: Schema.Number.check(Schema.isFinite()).annotate({
    description: "Epoch milliseconds (UTC) when the adapter was last successfully invoked.",
  }),
  five_hour: Schema.optional(Window).annotate({ description: "5-hour rolling usage window." }),
  weekly: Schema.optional(Window).annotate({ description: "Calendar week usage window." }),
  error: Schema.optional(Schema.String).annotate({
    description: "Most recent adapter failure message, if any.",
  }),
}).annotate({ identifier: "TokenUsage" })
export type Usage = Schema.Schema.Type<typeof Usage>

const AdapterOutput = Schema.Struct({
  five_hour: Schema.optional(Window),
  weekly: Schema.optional(Window),
}).annotate({ identifier: "TokenUsageAdapterOutput" })

interface CachedEntry {
  readonly refreshedAt: number
  readonly fiveHour: Window | undefined
  readonly weekly: Window | undefined
  readonly error: string | undefined
}

interface State {
  readonly entries: Map<string, CachedEntry>
}

function emptyState(): State {
  return { entries: new Map<string, CachedEntry>() }
}

export interface Interface {
  readonly get: (providerID: ProviderV2.ID) => Effect.Effect<Usage | undefined, never, Scope.Scope>
  readonly refresh: (providerID: ProviderV2.ID) => Effect.Effect<Usage | undefined, never, Scope.Scope>
  readonly refreshAll: () => Effect.Effect<ReadonlyArray<Usage>, never, Scope.Scope>
  readonly configured: () => Effect.Effect<ReadonlyArray<ProviderV2.ID>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TokenUsage") {}

function clampRefresh(seconds: number | undefined): number {
  if (seconds === undefined) return DEFAULT_REFRESH_SECONDS
  return Math.max(seconds, 0)
}

function clampTimeout(ms: number | undefined): number {
  if (ms === undefined) return DEFAULT_TIMEOUT_MS
  return Math.max(ms, 1_000)
}

function describeError(cause: unknown): string {
  if (cause instanceof AppProcessError) {
    if (cause.exitCode !== undefined) return `Adapter exited with code ${cause.exitCode}.`
    if (cause.stderr) return cause.stderr
    return "Adapter failed."
  }
  if (cause instanceof Error) return cause.message
  return "Unknown adapter failure."
}

function decodeAdapterOutput(input: unknown): {
  fiveHour: Window | undefined
  weekly: Window | undefined
} {
  const decoded = Schema.decodeUnknownSync(AdapterOutput)(input)
  return { fiveHour: decoded.five_hour, weekly: decoded.weekly }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const process = yield* AppProcess.Service
    const stateRef = yield* Ref.make(emptyState())
    const startedRef = yield* Ref.make(false)

    const resolveConfig = Effect.fn("TokenUsage.resolveConfig")(function* (providerID: ProviderV2.ID) {
      const info = yield* cfg.get()
      return info.token_usage?.[providerID]
    })

    const writeEntry = (
      providerID: ProviderV2.ID,
      update: (prior: CachedEntry | undefined) => CachedEntry,
    ) =>
      Ref.update(stateRef, (s) => {
        const next = update(s.entries.get(providerID))
        s.entries.set(providerID, next)
        return s
      })

    const runAdapter = Effect.fn("TokenUsage.runAdapter")(function* (providerID: ProviderV2.ID) {
      const config = yield* resolveConfig(providerID)
      if (!config) return undefined
      const [head, ...args] = config.command
      if (!head) return undefined

      const result = yield* process
        .run(ChildProcess.make(head, args, { stdin: "ignore" }), {
          timeout: Duration.millis(clampTimeout(config.timeout)),
          maxOutputBytes: MAX_OUTPUT_BYTES,
          maxErrorBytes: MAX_OUTPUT_BYTES,
        })
        .pipe(Effect.mapError(describeError))

      if (result.exitCode !== 0) {
        const stderr = result.stderr.toString("utf8").trim()
        return yield* Effect.fail(
          new AppProcessError({
            command: result.command,
            exitCode: result.exitCode,
            ...(stderr ? { stderr } : {}),
          }),
        ).pipe(Effect.mapError(describeError))
      }

      const trimmed = result.stdout.toString("utf8").trim()
      if (!trimmed) {
        yield* Effect.logWarning("token usage adapter returned empty output", { providerID })
        return undefined
      }

      const parsed = yield* Effect.try({
        try: () => JSON.parse(trimmed) as unknown,
        catch: (cause) =>
          new Error(
            `Adapter output is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
          ),
      })
      const decoded = yield* Effect.try({
        try: () => decodeAdapterOutput(parsed),
        catch: (cause) =>
          new Error(
            `Adapter output failed schema validation: ${cause instanceof Error ? cause.message : String(cause)}`,
          ),
      })

      const refreshedAt = yield* Clock.currentTimeMillis
      yield* writeEntry(providerID, () => ({
        refreshedAt,
        fiveHour: decoded.fiveHour,
        weekly: decoded.weekly,
        error: undefined,
      }))
      const usage: Usage = {
        provider_id: providerID,
        refreshed_at: refreshedAt,
        ...(decoded.fiveHour ? { five_hour: decoded.fiveHour } : {}),
        ...(decoded.weekly ? { weekly: decoded.weekly } : {}),
      }
      return usage
    })

    const recordFailure = Effect.fn("TokenUsage.recordFailure")(function* (
      providerID: ProviderV2.ID,
      message: string,
    ) {
      const refreshedAt = yield* Clock.currentTimeMillis
      yield* writeEntry(providerID, (prior) => ({
        refreshedAt,
        fiveHour: prior?.fiveHour,
        weekly: prior?.weekly,
        error: message,
      }))
    })

    const ensureStarted = (): Effect.Effect<void, never, Scope.Scope> =>
      Effect.gen(function* () {
        const started = yield* Ref.get(startedRef)
        if (started) return
        yield* Ref.set(startedRef, true)
        yield* startBackground().pipe(Effect.catch(() => Effect.void))
      })

    const refresh: (providerID: ProviderV2.ID) => Effect.Effect<Usage | undefined, never, Scope.Scope> = Effect.fn(
      "TokenUsage.refresh",
    )(function* (providerID: ProviderV2.ID) {
      yield* ensureStarted()
      const exit = yield* runAdapter(providerID).pipe(Effect.exit)
      if (exit._tag === "Failure") {
        const message = describeError(Cause.squash(exit.cause))
        yield* recordFailure(providerID, message)
        return undefined
      }
      return exit.value
    })

    const get = Effect.fn("TokenUsage.get")(function* (providerID: ProviderV2.ID) {
      yield* ensureStarted()
      const config = yield* resolveConfig(providerID)
      if (!config) return undefined
      const state = yield* Ref.get(stateRef)
      const entry = state.entries.get(providerID)
      const refreshSeconds = clampRefresh(config.refresh_interval)
      const now = yield* Clock.currentTimeMillis
      if (!entry || now - entry.refreshedAt >= refreshSeconds * 1000) {
        return yield* refresh(providerID)
      }
      const usage: Usage = {
        provider_id: providerID,
        refreshed_at: entry.refreshedAt,
        ...(entry.fiveHour ? { five_hour: entry.fiveHour } : {}),
        ...(entry.weekly ? { weekly: entry.weekly } : {}),
        ...(entry.error ? { error: entry.error } : {}),
      }
      return usage
    })

    const refreshAll = Effect.fn("TokenUsage.refreshAll")(function* () {
      const info = yield* cfg.get()
      const ids = Object.keys(info.token_usage ?? {})
      if (ids.length === 0) return [] as ReadonlyArray<Usage>
      const rows = yield* Effect.forEach(
        ids,
        (id) => Effect.gen(function* () { return yield* refresh(ProviderV2.ID.make(id)) }),
        { concurrency: "unbounded" },
      )
      return rows.filter((row): row is Usage => row !== undefined)
    })

    const configured = Effect.fn("TokenUsage.configured")(function* () {
      const info = yield* cfg.get()
      return Object.keys(info.token_usage ?? {}).map((id) => ProviderV2.ID.make(id))
    })

    // Background periodic refresh of every configured provider. Deferred
    // until the first get/refresh so it inherits the request-time
    // InstanceContext, rather than crashing at layer-materialization time
    // when no context is available.
    const startBackground: () => Effect.Effect<void, never, Scope.Scope> = Effect.fn(
      "TokenUsage.startBackground",
    )(function* () {
      const info = yield* cfg.get()
      const tokenUsage = info.token_usage ?? {}
      const ids = Object.keys(tokenUsage)
      if (ids.length === 0) return
      yield* Effect.forEach(
        ids,
        (id) => {
          const seconds = clampRefresh(tokenUsage[id]?.refresh_interval)
          return refresh(ProviderV2.ID.make(id)).pipe(
            Effect.catch(() => Effect.void),
            Effect.repeat(Schedule.spaced(Duration.seconds(seconds))),
            Effect.forkScoped,
          )
        },
        { concurrency: "unbounded", discard: true },
      )
    })

    return Service.of({ get, refresh, refreshAll, configured })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(AppProcess.defaultLayer),
)

export const node = LayerNode.make(layer, [Config.node, AppProcess.node])

export const _testing = { describeError, decodeAdapterOutput, clampRefresh, clampTimeout }
