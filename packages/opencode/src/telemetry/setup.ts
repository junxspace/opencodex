import { Database } from "@opencode-ai/core/database/database"
import { Telemetry, TelemetryTable } from "@opencode-ai/core/telemetry"
import { runID } from "@opencode-ai/core/observability/shared"
import { Database as BunSqlite } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"

let client: BunSqlite.Database | undefined
let db: ReturnType<typeof drizzle> | undefined
let ready = false

function write(input: { event: Telemetry.Event; properties: Record<string, unknown> }) {
  if (!db) {
    client = new BunSqlite(Database.path())
    client.run("PRAGMA journal_mode = WAL")
    client.run("PRAGMA busy_timeout = 5000")
    db = drizzle({ client })
  }

  db
    .insert(TelemetryTable)
    .values({
      event: input.event,
      distinct_id: runID,
      properties: input.properties,
      time_created: Date.now(),
    })
    .run()
}

function disabled() {
  return process.env.OPENCODE_DISABLE_TELEMETRY === "1" || process.env.OPENCODE_DISABLE_TELEMETRY === "true"
}

export function resetTelemetrySetup() {
  ready = false
  client?.close()
  client = undefined
  db = undefined
  Telemetry.setCaptureHandler(undefined)
}

export function setupTelemetry(input?: { enabled?: boolean }) {
  if (ready) return
  ready = true

  Telemetry.init({ enabled: input?.enabled ?? !disabled() })
  Telemetry.setCaptureHandler((capture) => {
    try {
      write(capture)
    } catch {
      // Never block session execution on telemetry writes.
    }
  })
}
