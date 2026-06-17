import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions, getLanIPv4Addresses } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"
import * as Log from "@opencode-ai/core/util/log"
import { InstallationLocal } from "@opencode-ai/core/installation/version"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs).default("hostname", "0.0.0.0"),
  describe: "starts a headless opencode server",
  // Server loads instances per-request via x-opencode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    if (opts.hostname === "0.0.0.0") {
      console.log(`opencode server listening on http://localhost:${server.port}`)
      for (const ip of getLanIPv4Addresses()) {
        console.log(`opencode server LAN access: http://${ip}:${server.port}`)
      }
    } else {
      console.log(`opencode server listening on http://${server.hostname}:${server.port}`)
    }

    const level = (() => {
      const fromEnv = process.env.OPENCODE_LOG_LEVEL?.toUpperCase()
      if (fromEnv === "DEBUG" || fromEnv === "INFO" || fromEnv === "WARN" || fromEnv === "ERROR") return fromEnv
      return InstallationLocal ? "DEBUG" : "INFO"
    })()
    yield* Effect.promise(() =>
      Log.init({
        print: process.argv.includes("--print-logs") || process.env.OPENCODE_PRINT_LOGS === "1",
        dev: InstallationLocal,
        level,
      }),
    )

    const { setupTelemetry } = yield* Effect.promise(() => import("@/telemetry/setup"))
    setupTelemetry()

    const { setupNotification } = yield* Effect.promise(() => import("@/notification/webhook"))
    yield* Effect.promise(() => setupNotification())

    yield* Effect.never
  }),
})
