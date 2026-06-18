import { Effect } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { Provider } from "@/provider/provider"
import { Config } from "@/config/config"
import { AutoDream } from "./auto-dream"
import { AutoDistill } from "./auto-distill"
import * as SearchConfig from "@opencode-ai/core/memory/search-config"
import { SessionID } from "./schema"

const CHECKPOINT_TOKEN_THRESHOLD = 0.85
const AUTO_CHECKPOINT_DEBOUNCE_TOKENS = 5_000

const warned = new Set<string>()
const lastAutoCheckpointTokens = new Map<string, number>()

export function tokenCount(tokens: SessionV1.Assistant["tokens"]) {
  return tokens.total || tokens.input + tokens.output + tokens.cache.read + tokens.cache.write
}

export function tokenRatio(input: { tokens: SessionV1.Assistant["tokens"]; model: Provider.Model }) {
  if (input.model.limit.context === 0) return 0
  return tokenCount(input.tokens) / input.model.limit.context
}

export function shouldCheckpoint(ratio: number) {
  return ratio >= CHECKPOINT_TOKEN_THRESHOLD
}

function pluginName(spec: unknown) {
  if (typeof spec === "string") return spec
  if (Array.isArray(spec) && typeof spec[0] === "string") return spec[0]
  return ""
}

export function hasWorkingMemoryPlugin(cfg: {
  plugin?: unknown[]
  plugin_origins?: { spec: unknown }[]
}) {
  const specs = [...(cfg.plugin ?? []), ...(cfg.plugin_origins?.map((item) => item.spec) ?? [])]
  return specs.some((spec) => pluginName(spec).includes("opencode-working-memory"))
}

export function hasDcpPlugin(cfg: { plugin?: unknown[]; plugin_origins?: { spec: unknown }[] }) {
  const specs = [...(cfg.plugin ?? []), ...(cfg.plugin_origins?.map((item) => item.spec) ?? [])]
  return specs.some((spec) => pluginName(spec).includes("opencode-dcp"))
}

export const applyRuntimeConfig = Effect.fn("MemoryAuto.applyRuntimeConfig")(function* () {
  const cfg = yield* Config.Service.pipe(Effect.flatMap((svc) => svc.get()))
  SearchConfig.apply({ score_floor: cfg.checkpoint?.memory_search_score_floor })
  yield* validateConfig(cfg)
})

export const validateConfig = Effect.fn("MemoryAuto.validateConfig")(function* (cfg: {
  plugin?: unknown[]
  plugin_origins?: { spec: unknown }[]
  compaction?: { prune?: boolean }
  remember?: { auto?: boolean }
}) {
  if (hasWorkingMemoryPlugin(cfg) && cfg.remember?.auto !== false) {
    if (!warned.has("working-memory-remember")) {
      warned.add("working-memory-remember")
      yield* Effect.logWarning(
        "opencode-working-memory is enabled: built-in remember.auto is ignored to avoid duplicate memory capture. Remove the plugin or set remember.auto: false.",
      )
    }
  }
  if (hasDcpPlugin(cfg) && cfg.compaction?.prune === true) {
    if (!warned.has("dcp-prune")) {
      warned.add("dcp-prune")
      yield* Effect.logWarning(
        "Both @tarquinen/opencode-dcp and compaction.prune are enabled. Prefer DCP alone and set compaction.prune: false.",
      )
    }
  }
})

export function rememberAutoEnabled(cfg: {
  plugin?: unknown[]
  plugin_origins?: { spec: unknown }[]
  remember?: { auto?: boolean }
}) {
  if (cfg.remember?.auto === false) return false
  if (hasWorkingMemoryPlugin(cfg)) return false
  return true
}

export function consumeAutoCheckpoint(input: {
  sessionID: SessionID
  tokens: SessionV1.Assistant["tokens"]
  model: Provider.Model
}) {
  const ratio = tokenRatio(input)
  if (!shouldCheckpoint(ratio)) return false

  const count = tokenCount(input.tokens)
  const previous = lastAutoCheckpointTokens.get(input.sessionID) ?? 0
  if (previous > 0 && count - previous < AUTO_CHECKPOINT_DEBOUNCE_TOKENS) return false
  lastAutoCheckpointTokens.set(input.sessionID, count)
  return true
}

export const shouldAutoDream = AutoDream.shouldAutoDream
export const markDreamRun = AutoDream.markDreamRun
export const shouldAutoDistill = AutoDistill.shouldAutoDistill
export const markDistillRun = AutoDistill.markDistillRun

export * as MemoryAuto from "./memory-auto"
