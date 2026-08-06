#!/usr/bin/env bun
/**
 * Adapter for `mmx quota` (MiniMaxTokenPlanMax provider).
 *
 * Runs `mmx quota` and prints a JSON object on stdout that matches the
 * TokenUsage schema the opencode server expects:
 *
 *   {
 *     "five_hour": { "used_percent": number, "reset_at": number }, // epoch ms
 *     "weekly":    { "used_percent": number, "reset_at": number }  // epoch ms
 *   }
 *
 * Configure in opencode.jsonc under `token_usage.<providerID>.command`.
 */
import { spawnSync } from "node:child_process"

type Window = {
  used_percent: number
  reset_at: number
}

type QuotaEntry = {
  model_name?: string
  end_time?: number
  weekly_end_time?: number
  current_interval_remaining_percent?: number
  current_weekly_remaining_percent?: number
}

type QuotaResponse = {
  model_remains?: QuotaEntry[]
}

const result = spawnSync("mmx", ["quota"], { encoding: "utf8" })
if (result.error) {
  console.error(`mmx-quota: failed to spawn \`mmx quota\`: ${result.error.message}`)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`mmx-quota: \`mmx quota\` exited with code ${result.status}`)
  if (result.stderr) console.error(result.stderr)
  process.exit(result.status ?? 1)
}

let payload: QuotaResponse
try {
  payload = JSON.parse(result.stdout) as QuotaResponse
} catch (error) {
  console.error(
    `mmx-quota: failed to parse \`mmx quota\` output as JSON: ${(error as Error).message}`,
  )
  process.exit(1)
}

const general = payload.model_remains?.find((entry) => entry.model_name === "general")
if (!general) {
  console.error('mmx-quota: no `model_remains` entry with model_name === "general" was found')
  process.exit(1)
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const fiveHour: Window = {
  used_percent: clamp(100 - (general.current_interval_remaining_percent ?? 0)),
  reset_at: general.end_time ?? Date.now(),
}
const weekly: Window = {
  used_percent: clamp(100 - (general.current_weekly_remaining_percent ?? 0)),
  reset_at: general.weekly_end_time ?? Date.now(),
}

process.stdout.write(JSON.stringify({ five_hour: fiveHour, weekly: weekly }))
