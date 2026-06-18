import { Effect } from "effect"
import { Config } from "@/config/config"
import { Checkpoint } from "@opencode-ai/core/checkpoint"
import { Memory } from "@opencode-ai/core/memory"
import { AutoDream } from "./auto-dream"
import { MemoryAuto, shouldCheckpoint } from "./memory-auto"
import { SessionID } from "./schema"

export function triggerCheckpoint(sessionID: SessionID, content: string) {
  return Effect.gen(function* () {
    const configSvc = yield* Config.Service
    const cfg = yield* configSvc.get()
    
    if (cfg.checkpoint?.memory_reconcile_on_search !== false) {
      const memory = yield* Memory.Service
      yield* memory.reconcile().pipe(Effect.catch(() => Effect.void))
    }
    
    const checkpoint = yield* Checkpoint.Service
    yield* checkpoint.write({ sessionID, content }).pipe(Effect.catch(() => Effect.void))
    
    yield* Effect.logInfo("checkpoint written", { sessionID })
  })
}

export function maybeCheckpointAndDream(
  sessionID: SessionID,
  tokenRatio: number,
  checkpointContent?: string,
) {
  return Effect.gen(function* () {
    if (checkpointContent && shouldCheckpoint(tokenRatio)) {
      yield* triggerCheckpoint(sessionID, checkpointContent)
    }
    
    yield* AutoDream.spawnDreamAgent(sessionID).pipe(Effect.catch(() => Effect.void))
  })
}

export * as CheckpointTrigger from "./checkpoint-trigger"
export { shouldCheckpoint } from "./memory-auto"
