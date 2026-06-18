import { Effect } from "effect"
import { Config } from "@/config/config"
import { MemoryAuto } from "./memory-auto"
import { Global } from "@opencode-ai/core/global"
import { SessionID } from "./schema"
import fs from "fs/promises"
import path from "path"

const DEFAULT_DISTILL_INTERVAL_DAYS = 30
const MIN_SPAWN_GAP_MS = 10_000
const LAST_DISTILL_FILE = "last-distill.json"

let lastSpawnTime = 0

async function readLastDistillTime(): Promise<number> {
  try {
    const file = path.join(Global.Path.data, LAST_DISTILL_FILE)
    const content = await fs.readFile(file, "utf-8")
    const data = JSON.parse(content)
    return data.timestamp ?? 0
  } catch {
    return 0
  }
}

async function writeLastDistillTime(timestamp: number): Promise<void> {
  try {
    const file = path.join(Global.Path.data, LAST_DISTILL_FILE)
    await fs.writeFile(file, JSON.stringify({ timestamp }), "utf-8")
  } catch {}
}

export function shouldAutoDistill() {
  return Effect.gen(function* () {
    const configSvc = yield* Config.Service
    const cfg = yield* configSvc.get()
    const enabled = cfg.distill?.auto === true
    if (!enabled) return false

    const now = Date.now()
    if (now - lastSpawnTime < MIN_SPAWN_GAP_MS) return false

    const intervalDays = cfg.distill?.interval_days ?? DEFAULT_DISTILL_INTERVAL_DAYS
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000

    const lastTime = yield* Effect.promise(readLastDistillTime)
    if (now - lastTime < intervalMs) return false

    return true
  })
}

export function markDistillRun() {
  return Effect.sync(() => {
    lastSpawnTime = Date.now()
    writeLastDistillTime(Date.now()).catch(() => {})
  })
}

export function spawnDistillAgent(sessionID: SessionID) {
  return Effect.gen(function* () {
    const shouldRun = yield* MemoryAuto.shouldAutoDistill()
    if (!shouldRun) return false
    yield* MemoryAuto.markDistillRun()
    yield* Effect.logInfo("spawning distill agent for workflow extraction", { sessionID })
    return true
  })
}

export * as AutoDistill from "./auto-distill"