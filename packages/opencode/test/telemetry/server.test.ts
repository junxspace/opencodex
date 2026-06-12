import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Database as BunSqlite } from "bun:sqlite"
import { startTelemetryServer } from "../../src/telemetry/server"
import { tmpdir } from "../fixture/fixture"

afterEach(() => {
  delete process.env.OPENCODE_DB
  Flag.OPENCODE_DB = undefined
})

describe("telemetry server", () => {
  test("serves dashboard and telemetry api", async () => {
    await using tmp = await tmpdir()
    const dbPath = `${tmp.path}/test.db`
    process.env.OPENCODE_DB = dbPath
    Flag.OPENCODE_DB = dbPath

    const client = new BunSqlite(Database.path())
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
        JSON.stringify({ providerID: "openai", modelID: "gpt-test", inputTokens: 1, outputTokens: 2 }),
        Date.now(),
      )
    client.close()

    using server = startTelemetryServer({ hostname: "127.0.0.1", port: 0, pollMs: 1000 })
    const base = `http://${server.hostname}:${server.port}`

    const page = await fetch(`${base}/`)
    expect(page.status).toBe(200)
    expect(page.headers.get("content-type")).toContain("text/html")
    const html = await page.text()
    expect(html).toContain("OpenCode Telemetry")
    expect(html).toContain('id="toggle-theme"')
    expect(html).toContain('id="model-filter"')
    expect(html).toContain("opencode-telemetry-theme")

    const telemetry = await fetch(`${base}/api/telemetry?since=0`)
    const body = (await telemetry.json()) as { items: Array<{ event: string }> }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.event).toBe("llm.completion")

    const stats = await fetch(`${base}/api/summary`)
    const summary = (await stats.json()) as { calls: number }
    expect(summary.calls).toBe(1)

    const models = await fetch(`${base}/api/models`)
    const modelBody = (await models.json()) as { items: Array<{ providerID: string; modelID: string }> }
    expect(modelBody.items).toEqual([{ providerID: "openai", modelID: "gpt-test" }])

    const filtered = await fetch(`${base}/api/telemetry?since=0&model=openai/gpt-test`)
    const filteredBody = (await filtered.json()) as { items: Array<{ event: string }> }
    expect(filteredBody.items).toHaveLength(1)

    const pageHtml = await (await fetch(`${base}/`)).text()
    expect(pageHtml).toContain("All-time statistics")
    expect(pageHtml).toContain('id="events-scope"')

    const latest = await fetch(`${base}/api/telemetry?latest=1`)
    const latestBody = (await latest.json()) as { items: Array<{ id: number }> }
    expect(latestBody.items).toHaveLength(1)
    expect(latestBody.items[0]?.id).toBe(1)
  })
})
