import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { entries, lazyCommand } from "./cli/commands"
import { UI } from "./cli/ui"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { FormatError } from "./cli/error"
import { EOL } from "os"
import { errorMessage } from "./util/error"
import { Heap } from "./cli/heap"
import { StartupTrace } from "@opencode-ai/core/util/startup-trace"

StartupTrace.mark("cli.index")

const args = hideBin(process.argv)

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("opencode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + EOL)
    return
  }
  process.stderr.write(out)
}

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("opencode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    StartupTrace.mark("cli.middleware.start")
    if (opts.printLogs) process.env.OPENCODE_PRINT_LOGS = "1"
    if (opts.logLevel) process.env.OPENCODE_LOG_LEVEL = opts.logLevel
    if (opts.pure) {
      process.env.OPENCODE_PURE = "1"
    }

    Heap.start()

    const Log = await import("@opencode-ai/core/util/log")
    const { InstallationLocal } = await import("@opencode-ai/core/installation/version")
    const level = (() => {
      const fromEnv = process.env.OPENCODE_LOG_LEVEL?.toUpperCase()
      if (fromEnv === "DEBUG" || fromEnv === "INFO" || fromEnv === "WARN" || fromEnv === "ERROR") return fromEnv
      return InstallationLocal ? "DEBUG" : "INFO"
    })()
    await Log.init({
      print: Boolean(opts.printLogs) || process.env.OPENCODE_PRINT_LOGS === "1",
      dev: InstallationLocal,
      level,
    })

    const { setupTelemetry } = await import("./telemetry/setup")
    setupTelemetry()

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.OPENCODE_PID = String(process.pid)
    StartupTrace.mark("cli.middleware.done")
  })
  .usage("")
  .completion("completion", "generate shell completion script")

for (const entry of entries) {
  cli.command(lazyCommand(entry))
}

cli
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
