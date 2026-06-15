import { Server } from "@/server/server"
import { InstanceRuntime } from "@/project/instance-runtime"
import { Rpc } from "@/util/rpc"
import { upgrade } from "@/cli/upgrade"
import { Config } from "@/config/config"
import { GlobalBus } from "@/bus/global"
import { ServerAuth } from "@/server/auth"
import { writeHeapSnapshot } from "node:v8"
import { Heap } from "@/cli/heap"
import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import * as Log from "@opencode-ai/core/util/log"
import { InstallationLocal } from "@opencode-ai/core/installation/version"
import { StartupTrace } from "@opencode-ai/core/util/startup-trace"

const trace = StartupTrace.child("worker")
trace("module")

const level = (() => {
  const fromEnv = process.env.OPENCODE_LOG_LEVEL?.toUpperCase()
  if (fromEnv === "DEBUG" || fromEnv === "INFO" || fromEnv === "WARN" || fromEnv === "ERROR") return fromEnv
  return InstallationLocal ? "DEBUG" : "INFO"
})()

await Log.init({
  print: process.argv.includes("--print-logs") || process.env.OPENCODE_PRINT_LOGS === "1",
  dev: InstallationLocal,
  level,
})

const { setupTelemetry } = await import("@/telemetry/setup")
setupTelemetry()

Heap.start()

GlobalBus.on("event", (event) => {
  Rpc.emit("global.event", event)
})

const { setupNotification } = await import("@/notification/webhook")
await setupNotification()
trace("notification")

let server: Awaited<ReturnType<typeof Server.listen>> | undefined

export const rpc = {
  async fetch(input: { url: string; method: string; headers: Record<string, string>; body?: string }) {
    const headers = { ...input.headers }
    const auth = ServerAuth.header()
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body,
    })
    const response = await Server.Default().app.fetch(request)
    const body = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
  snapshot() {
    const result = writeHeapSnapshot("server.heapsnapshot")
    return result
  },
  async server(input: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    if (server) await server.stop(true)
    server = await Server.listen(input)
    return { url: server.url.toString() }
  },
  async checkUpgrade(input: { directory: string }) {
    await InstanceRuntime.load({ directory: input.directory })
    await upgrade().catch(() => {})
  },
  async warmup(input: { directory: string }) {
    trace("warmup.start")
    await InstanceRuntime.load({ directory: input.directory })
    trace("warmup.done")
  },
  async reload() {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const cfg = yield* Config.Service
        yield* cfg.invalidate()
        yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      }),
    )
  },
  async shutdown() {
    await InstanceRuntime.disposeAllInstances()
    if (server) await server.stop(true)
  },
}

Rpc.listen(rpc)
trace("rpc.listen")
