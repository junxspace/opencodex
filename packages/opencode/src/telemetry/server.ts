import { Database } from "@opencode-ai/core/database/database"
import { telemetryPage } from "./page"
import { latestId, list, listModels, summary } from "./query"

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
        const latest = Number(url.searchParams.get("latest") ?? "0")
        const event = url.searchParams.get("event") ?? undefined
        const model = url.searchParams.get("model") ?? undefined
        const items = list({
          since: Number.isFinite(since) ? since : 0,
          limit: Number.isFinite(limit) ? limit : 100,
          latest: Number.isFinite(latest) && latest > 0 ? latest : undefined,
          event: event || undefined,
          model: model || undefined,
        })
        return Response.json({ items, latestId: latestId() })
      }

      if (request.method === "GET" && url.pathname === "/api/summary") {
        const model = url.searchParams.get("model") ?? undefined
        return Response.json(summary({ model: model || undefined }))
      }

      if (request.method === "GET" && url.pathname === "/api/models") {
        return Response.json({ items: listModels() })
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
