import { Database } from "@opencode-ai/core/database/database"
import { Database as BunSqlite } from "bun:sqlite"

export type Row = {
  id: number
  event: string
  distinct_id: string | null
  properties: Record<string, unknown> | null
  time_created: number
}

export type Summary = {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  avgDurationMs: number
  avgTimeToFirstTokenMs: number
  avgStreamMs: number
  turns: number
  avgTurnDurationMs: number
  toolCalls: number
  avgToolDurationMs: number
  byModel: Array<{
    providerID: string
    modelID: string
    calls: number
    cost: number
    inputTokens: number
    outputTokens: number
  }>
}

function readClient() {
  const client = new BunSqlite(Database.path(), { readonly: true })
  client.run("PRAGMA busy_timeout = 5000")
  return client
}

function parseProperties(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === "object") return value as Record<string, unknown>
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

export function latestId() {
  const client = readClient()
  try {
    const row = client.query("SELECT max(id) as id FROM telemetry").get() as { id: number | null } | null
    return row?.id ?? 0
  } catch {
    return 0
  } finally {
    client.close()
  }
}

export function list(input: { since?: number; limit?: number; event?: string }) {
  const since = input.since ?? 0
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500)
  const client = readClient()
  try {
    const rows = input.event
      ? (client
          .query(
            `SELECT id, event, distinct_id, properties, time_created
             FROM telemetry
             WHERE id > ? AND event = ?
             ORDER BY id ASC
             LIMIT ?`,
          )
          .all(since, input.event, limit) as Array<{
          id: number
          event: string
          distinct_id: string | null
          properties: string | null
          time_created: number
        }>)
      : (client
          .query(
            `SELECT id, event, distinct_id, properties, time_created
             FROM telemetry
             WHERE id > ?
             ORDER BY id ASC
             LIMIT ?`,
          )
          .all(since, limit) as Array<{
          id: number
          event: string
          distinct_id: string | null
          properties: string | null
          time_created: number
        }>)

    return rows.map((row) => ({
      id: row.id,
      event: row.event,
      distinct_id: row.distinct_id,
      properties: parseProperties(row.properties),
      time_created: row.time_created,
    })) satisfies Row[]
  } catch {
    return [] as Row[]
  } finally {
    client.close()
  }
}

export function summary() {
  const client = readClient()
  try {
    const totals = client
      .query(
        `SELECT
          count(*) as calls,
          coalesce(sum(cast(json_extract(properties, '$.inputTokens') as real)), 0) as input_tokens,
          coalesce(sum(cast(json_extract(properties, '$.outputTokens') as real)), 0) as output_tokens,
          coalesce(sum(cast(json_extract(properties, '$.cacheReadTokens') as real)), 0) as cache_read_tokens,
          coalesce(sum(cast(json_extract(properties, '$.cacheWriteTokens') as real)), 0) as cache_write_tokens,
          coalesce(sum(cast(json_extract(properties, '$.cost') as real)), 0) as cost,
          coalesce(avg(cast(json_extract(properties, '$.durationMs') as real)), 0) as avg_duration_ms,
          coalesce(avg(cast(json_extract(properties, '$.timeToFirstTokenMs') as real)), 0) as avg_ttft_ms,
          coalesce(avg(cast(json_extract(properties, '$.streamMs') as real)), 0) as avg_stream_ms
         FROM telemetry
         WHERE event = 'llm.completion'`,
      )
      .get() as {
      calls: number
      input_tokens: number
      output_tokens: number
      cache_read_tokens: number
      cache_write_tokens: number
      cost: number
      avg_duration_ms: number
      avg_ttft_ms: number
      avg_stream_ms: number
    } | null

    const turns = client
      .query(
        `SELECT
          count(*) as turns,
          coalesce(avg(cast(json_extract(properties, '$.durationMs') as real)), 0) as avg_turn_duration_ms
         FROM telemetry
         WHERE event = 'turn.completed'`,
      )
      .get() as { turns: number; avg_turn_duration_ms: number } | null

    const tools = client
      .query(
        `SELECT
          count(*) as tool_calls,
          coalesce(avg(cast(json_extract(properties, '$.durationMs') as real)), 0) as avg_tool_duration_ms
         FROM telemetry
         WHERE event = 'tool.used'`,
      )
      .get() as { tool_calls: number; avg_tool_duration_ms: number } | null

    const byModel = client
      .query(
        `SELECT
          json_extract(properties, '$.providerID') as provider_id,
          json_extract(properties, '$.modelID') as model_id,
          count(*) as calls,
          coalesce(sum(cast(json_extract(properties, '$.cost') as real)), 0) as cost,
          coalesce(sum(cast(json_extract(properties, '$.inputTokens') as real)), 0) as input_tokens,
          coalesce(sum(cast(json_extract(properties, '$.outputTokens') as real)), 0) as output_tokens
         FROM telemetry
         WHERE event = 'llm.completion'
         GROUP BY provider_id, model_id
         ORDER BY calls DESC
         LIMIT 20`,
      )
      .all() as Array<{
      provider_id: string | null
      model_id: string | null
      calls: number
      cost: number
      input_tokens: number
      output_tokens: number
    }>

    return {
      calls: totals?.calls ?? 0,
      inputTokens: totals?.input_tokens ?? 0,
      outputTokens: totals?.output_tokens ?? 0,
      cacheReadTokens: totals?.cache_read_tokens ?? 0,
      cacheWriteTokens: totals?.cache_write_tokens ?? 0,
      cost: totals?.cost ?? 0,
      avgDurationMs: Math.round(totals?.avg_duration_ms ?? 0),
      avgTimeToFirstTokenMs: Math.round(totals?.avg_ttft_ms ?? 0),
      avgStreamMs: Math.round(totals?.avg_stream_ms ?? 0),
      turns: turns?.turns ?? 0,
      avgTurnDurationMs: Math.round(turns?.avg_turn_duration_ms ?? 0),
      toolCalls: tools?.tool_calls ?? 0,
      avgToolDurationMs: Math.round(tools?.avg_tool_duration_ms ?? 0),
      byModel: byModel.map((row) => ({
        providerID: row.provider_id ?? "unknown",
        modelID: row.model_id ?? "unknown",
        calls: row.calls,
        cost: row.cost,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      })),
    } satisfies Summary
  } catch {
    return {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0,
      avgDurationMs: 0,
      avgTimeToFirstTokenMs: 0,
      avgStreamMs: 0,
      turns: 0,
      avgTurnDurationMs: 0,
      toolCalls: 0,
      avgToolDurationMs: 0,
      byModel: [],
    } satisfies Summary
  } finally {
    client.close()
  }
}
