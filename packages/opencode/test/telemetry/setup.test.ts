import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Telemetry } from "@opencode-ai/core/telemetry"
import { Database as BunSqlite } from "bun:sqlite"
import { resetTelemetrySetup, setupTelemetry } from "../../src/telemetry/setup"
import { tmpdir } from "../fixture/fixture"

function ensureTelemetryTable(path: string) {
  const client = new BunSqlite(path)
  client.run(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      event TEXT NOT NULL,
      distinct_id TEXT,
      properties TEXT,
      time_created INTEGER NOT NULL
    );
  `)
  client.close()
}

afterEach(() => {
  resetTelemetrySetup()
  delete process.env.OPENCODE_DISABLE_TELEMETRY
  delete process.env.OPENCODE_DB
  Flag.OPENCODE_DB = undefined
})

describe("telemetry setup", () => {
  test("writes llm completion rows to sqlite", async () => {
    await using tmp = await tmpdir()
    const dbPath = `${tmp.path}/test.db`
    process.env.OPENCODE_DB = dbPath
    Flag.OPENCODE_DB = dbPath
    ensureTelemetryTable(Database.path())

    setupTelemetry()

    Telemetry.trackLlmCompletion({
      sessionID: "ses_local",
      providerID: "openai",
      modelID: "gpt-test",
      inputTokens: 3,
      outputTokens: 4,
      durationMs: 99,
    })

    const client = new BunSqlite(Database.path())
    const rows = client.query("SELECT event, distinct_id, properties FROM telemetry").all() as Array<{
      event: string
      distinct_id: string
      properties: string
    }>
    client.close()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.event).toBe("llm.completion")
    expect(rows[0]?.distinct_id).toBeTruthy()
    const properties = JSON.parse(rows[0]?.properties ?? "{}") as Record<string, unknown>
    expect(properties).toMatchObject({
      sessionID: "ses_local",
      providerID: "openai",
      modelID: "gpt-test",
      inputTokens: 3,
      outputTokens: 4,
      durationMs: 99,
    })
  })
})
