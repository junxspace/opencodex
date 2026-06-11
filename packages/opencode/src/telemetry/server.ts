import { Database } from "@opencode-ai/core/database/database"
import { telemetryPage } from "./page"
import { latestId, list, summary } from "./query"

export type TelemetryServerOptions = {
  hostname: string
  port: number
  pollMs: number
}

export function startTelemetryServer(options: TelemetryServerOptions) {
  const pollMs = Math.max(options.pollMs, 500)

  return Bun.serve({
    hostname: options.hostname,
    port: options.port,
    fetch(request) {
      const url = new URL(request.url)

      if (request.method === "GET" && url.pathname === "/") {
        return new Response(telemetryPage(pollMs), {
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      }

      if (request.method === "GET" && url.pathname === "/api/telemetry") {
        const since = Number(url.searchParams.get("since") ?? "0")
        const limit = Number(url.searchParams.get("limit") ?? "100")
        const event = url.searchParams.get("event") ?? undefined
        const items = list({
          since: Number.isFinite(since) ? since : 0,
          limit: Number.isFinite(limit) ? limit : 100,
          event: event || undefined,
        })
        return Response.json({ items, latestId: latestId() })
      }

      if (request.method === "GET" && url.pathname === "/api/summary") {
        return Response.json(summary())
      }

      if (request.method === "GET" && url.pathname === "/api/meta") {
        return Response.json({
          dbPath: Database.path(),
          pollMs,
          latestId: latestId(),
        })
      }

      return new Response("Not Found", { status: 404 })
    },
  })
}
