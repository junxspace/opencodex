import { Effect } from "effect"
import open from "open"
import { Database } from "@opencode-ai/core/database/database"
import { effectCmd } from "../effect-cmd"
import { UI } from "../ui"
import { startTelemetryServer } from "@/telemetry/server"
import { setupTelemetry } from "@/telemetry/setup"

const WebCommand = effectCmd({
  command: "web",
  describe: "start telemetry dashboard with live updates",
  instance: false,
  builder: (yargs) =>
    yargs
      .option("port", {
        type: "number",
        describe: "port to listen on",
        default: 4312,
      })
      .option("hostname", {
        type: "string",
        describe: "hostname to listen on",
        default: "127.0.0.1",
      })
      .option("interval", {
        type: "number",
        describe: "dashboard poll interval in milliseconds",
        default: 2000,
      })
      .option("open", {
        type: "boolean",
        describe: "open the dashboard in a browser",
        default: true,
      }),
  handler: Effect.fn("Cli.telemetry.web")(function* (args) {
    yield* Database.Service
    setupTelemetry()

    const server = startTelemetryServer({
      hostname: args.hostname,
      port: args.port,
      pollMs: args.interval,
    })

    const url = `http://${args.hostname === "0.0.0.0" ? "127.0.0.1" : server.hostname}:${server.port}`
    UI.empty()
    UI.println(UI.Style.TEXT_INFO_BOLD + "  Telemetry dashboard: ", UI.Style.TEXT_NORMAL, url)
    UI.println(UI.Style.TEXT_DIM + "  Database: ", UI.Style.TEXT_NORMAL, Database.path())
    UI.empty()

    if (args.open) open(url).catch(() => {})

    yield* Effect.never
  }),
})

export const TelemetryCommand = effectCmd({
  command: "telemetry",
  describe: "local performance telemetry tools",
  instance: false,
  builder: (yargs) => yargs.command(WebCommand).demandCommand(),
  handler: Effect.fn("Cli.telemetry")(function* () {}),
})
