import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Database as BunSqlite } from "bun:sqlite"
import { latestId, list, listModels, summary } from "../../src/telemetry/query"
import { tmpdir } from "../fixture/fixture"

function seed(path: string) {
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
  client
    .query(
      `INSERT INTO telemetry (event, distinct_id, properties, time_created)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      "llm.completion",
      "run_1",
      JSON.stringify({
        sessionID: "ses_1",
        providerID: "openai",
        modelID: "gpt-test",
        inputTokens: 10,
        outputTokens: 5,
        cost: 0.02,
        durationMs: 100,
        generationMs: 100,
        timeToFirstTokenMs: 900,
        streamMs: 1000,
      }),
      1_700_000_000_000,
    )
  client
    .query(
      `INSERT INTO telemetry (event, distinct_id, properties, time_created)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      "llm.completion",
      "run_2",
      JSON.stringify({
        sessionID: "ses_2",
        providerID: "anthropic",
        modelID: "claude-test",
        inputTokens: 20,
        outputTokens: 10,
        cost: 0.03,
        durationMs: 200,
        generationMs: 200,
        timeToFirstTokenMs: 1800,
        streamMs: 2000,
      }),
      1_700_000_001_000,
    )
  client
    .query(
      `INSERT INTO telemetry (event, distinct_id, properties, time_created)
       VALUES (?, ?, ?, ?)`,
    )
    .run("tool.used", "run_3", JSON.stringify({ tool: "read", durationMs: 300, status: "completed" }), 1_700_000_002_000)
  client
    .query(
      `INSERT INTO telemetry (event, distinct_id, properties, time_created)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      "turn.completed",
      "run_4",
      JSON.stringify({
        sessionID: "ses_1",
        userMessageID: "msg_user",
        assistantMessageID: "msg_assistant",
        durationMs: 31_700,
        assistantSteps: 2,
        toolCalls: 3,
      }),
      1_700_000_003_000,
    )
  client.close()
}

afterEach(() => {
  delete process.env.OPENCODE_DB
  Flag.OPENCODE_DB = undefined
})

describe("telemetry query", () => {
  test("lists rows after since id and filters by event", async () => {
    await using tmp = await tmpdir()
    const dbPath = `${tmp.path}/test.db`
    process.env.OPENCODE_DB = dbPath
    Flag.OPENCODE_DB = dbPath
    seed(Database.path())

    expect(latestId()).toBe(4)
    expect(list({ since: 1, event: "llm.completion" })).toHaveLength(1)
    expect(list({ since: 0, model: "openai/gpt-test" })).toHaveLength(1)
    expect(list({ since: 0 })).toHaveLength(4)
    expect(list({ latest: 2 }).map((row) => row.id)).toEqual([4, 3])
    expect(list({ latest: 1, event: "llm.completion" })[0]?.id).toBe(2)
    expect(listModels()).toEqual(
      expect.arrayContaining([
        { providerID: "openai", modelID: "gpt-test" },
        { providerID: "anthropic", modelID: "claude-test" },
      ]),
    )

    const stats = summary()
    expect(stats.calls).toBe(2)
    expect(stats.inputTokens).toBe(30)
    expect(stats.outputTokens).toBe(15)
    expect(stats.cost).toBeCloseTo(0.05)
    expect(stats.avgDurationMs).toBe(150)
    expect(stats.avgTimeToFirstTokenMs).toBe(1350)
    expect(stats.avgStreamMs).toBe(1500)
    expect(stats.turns).toBe(1)
    expect(stats.avgTurnDurationMs).toBe(31_700)
    expect(stats.toolCalls).toBe(1)
    expect(stats.avgToolDurationMs).toBe(300)
    expect(stats.byModel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerID: "openai", modelID: "gpt-test", calls: 1 }),
        expect.objectContaining({ providerID: "anthropic", modelID: "claude-test", calls: 1 }),
      ]),
    )

    const filtered = summary({ model: "openai/gpt-test" })
    expect(filtered.calls).toBe(1)
    expect(filtered.inputTokens).toBe(10)
    expect(filtered.byModel).toEqual([
      expect.objectContaining({ providerID: "openai", modelID: "gpt-test", calls: 1 }),
    ])
  })
})
