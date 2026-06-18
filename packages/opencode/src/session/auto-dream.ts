import { Effect } from "effect"
import { Config } from "@/config/config"
import { MemoryAuto } from "./memory-auto"
import { Global } from "@opencode-ai/core/global"
import { SessionID } from "./schema"
import fs from "fs/promises"
import path from "path"

const DEFAULT_DREAM_INTERVAL_DAYS = 7
const MIN_SPAWN_GAP_MS = 10_000
const LAST_DREAM_FILE = "last-dream.json"

let lastSpawnTime = 0

async function readLastDreamTime(): Promise<number> {
  try {
    const file = path.join(Global.Path.data, LAST_DREAM_FILE)
    const content = await fs.readFile(file, "utf-8")
    const data = JSON.parse(content)
    return data.timestamp ?? 0
  } catch {
    return 0
  }
}

async function writeLastDreamTime(timestamp: number): Promise<void> {
  try {
    const file = path.join(Global.Path.data, LAST_DREAM_FILE)
    await fs.writeFile(file, JSON.stringify({ timestamp }), "utf-8")
  } catch {}
}

export function shouldAutoDream() {
  return Effect.gen(function* () {
    const configSvc = yield* Config.Service
    const cfg = yield* configSvc.get()
    const enabled = cfg.dream?.auto === true
    if (!enabled) return false

    const now = Date.now()
    if (now - lastSpawnTime < MIN_SPAWN_GAP_MS) return false

    const intervalDays = cfg.dream?.interval_days ?? DEFAULT_DREAM_INTERVAL_DAYS
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000

    const lastTime = yield* Effect.promise(readLastDreamTime)
    if (now - lastTime < intervalMs) return false

    return true
  })
}

export function markDreamRun() {
  return Effect.sync(() => {
    lastSpawnTime = Date.now()
    writeLastDreamTime(Date.now()).catch(() => {})
  })
}

export function spawnDreamAgent(sessionID: SessionID) {
  return Effect.gen(function* () {
    const shouldRun = yield* MemoryAuto.shouldAutoDream()
    if (!shouldRun) return false
    yield* MemoryAuto.markDreamRun()
    yield* Effect.logInfo("spawning dream agent for memory consolidation", { sessionID })
    return true
  })
}

export * as AutoDream from "./auto-dream"
