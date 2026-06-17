import type { CommandModule } from "yargs"

type ErasedCommand = CommandModule<{}, {}>
type Loader = () => Promise<ErasedCommand>

export type CommandEntry = {
  command: string
  describe: string | false
  load: Loader
}

export function lazyCommand(entry: CommandEntry): CommandModule {
  let cached: ErasedCommand | undefined
  const load = async () => {
    if (cached) return cached
    cached = await entry.load()
    return cached
  }
  return {
    command: entry.command,
    describe: entry.describe,
    builder: (yargs) =>
      load().then((cmd) => {
        if (typeof cmd.builder === "function") return cmd.builder(yargs)
        return yargs
      }),
    handler: async (argv) => {
      const cmd = await load()
      return cmd.handler?.(argv)
    },
  }
}

function loadCmd<T>(load: () => Promise<T>): Loader {
  return () => load() as Promise<ErasedCommand>
}

export const entries: CommandEntry[] = [
  {
    command: "acp",
    describe: "start ACP (Agent Client Protocol) server",
    load: loadCmd(() => import("./cmd/acp").then((mod) => mod.AcpCommand)),
  },
  {
    command: "mcp",
    describe: "manage MCP (Model Context Protocol) servers",
    load: loadCmd(() => import("./cmd/mcp").then((mod) => mod.McpCommand)),
  },
  {
    command: "$0 [project]",
    describe: "start opencode tui",
    load: loadCmd(() => import("./cmd/tui").then((mod) => mod.TuiThreadCommand)),
  },
  {
    command: "attach [url]",
    describe: "attach to a running opencode server",
    load: loadCmd(() => import("./cmd/attach").then((mod) => mod.AttachCommand)),
  },
  {
    command: "run [message..]",
    describe: "run opencode with a message",
    load: loadCmd(() => import("./cmd/run").then((mod) => mod.RunCommand)),
  },
  {
    command: "generate",
    describe: "generate API client types from OpenAPI",
    load: loadCmd(() => import("./cmd/generate").then((mod) => mod.GenerateCommand)),
  },
  {
    command: "debug",
    describe: "debugging and troubleshooting tools",
    load: loadCmd(() => import("./cmd/debug").then((mod) => mod.DebugCommand)),
  },
  {
    command: "console",
    describe: false,
    load: loadCmd(() => import("./cmd/account").then((mod) => mod.ConsoleCommand)),
  },
  {
    command: "providers",
    describe: "manage AI providers and credentials",
    load: loadCmd(() => import("./cmd/providers").then((mod) => mod.ProvidersCommand)),
  },
  {
    command: "agent",
    describe: "manage agents",
    load: loadCmd(() => import("./cmd/agent").then((mod) => mod.AgentCommand)),
  },
  {
    command: "upgrade [target]",
    describe: "upgrade opencode to the latest or a specific version",
    load: loadCmd(() => import("./cmd/upgrade").then((mod) => mod.UpgradeCommand)),
  },
  {
    command: "uninstall",
    describe: "uninstall opencode and remove all related files",
    load: loadCmd(() => import("./cmd/uninstall").then((mod) => mod.UninstallCommand)),
  },
  {
    command: "serve",
    describe: "starts a headless opencode server",
    load: loadCmd(() => import("./cmd/serve").then((mod) => mod.ServeCommand)),
  },
  {
    command: "web",
    describe: "start opencode server and open web interface",
    load: loadCmd(() => import("./cmd/web").then((mod) => mod.WebCommand)),
  },
  {
    command: "models [provider]",
    describe: "list all available models",
    load: loadCmd(() => import("./cmd/models").then((mod) => mod.ModelsCommand)),
  },
  {
    command: "stats",
    describe: "show token usage and cost statistics",
    load: loadCmd(() => import("./cmd/stats").then((mod) => mod.StatsCommand)),
  },
  {
    command: "export [sessionID]",
    describe: "export session data as JSON",
    load: loadCmd(() => import("./cmd/export").then((mod) => mod.ExportCommand)),
  },
  {
    command: "import <file>",
    describe: "import session data from JSON file or URL",
    load: loadCmd(() => import("./cmd/import").then((mod) => mod.ImportCommand)),
  },
  {
    command: "github",
    describe: "manage GitHub agent",
    load: loadCmd(() => import("./cmd/github").then((mod) => mod.GithubCommand)),
  },
  {
    command: "pr <number>",
    describe: "fetch and checkout a GitHub PR branch, then run opencode",
    load: loadCmd(() => import("./cmd/pr").then((mod) => mod.PrCommand)),
  },
  {
    command: "session",
    describe: "manage sessions",
    load: loadCmd(() => import("./cmd/session").then((mod) => mod.SessionCommand)),
  },
  {
    command: "fast-commit",
    describe: "split changes into commits with AI-generated Chinese messages",
    load: loadCmd(() => import("./cmd/fast-commit").then((mod) => mod.FastCommitCommand)),
  },
  {
    command: "fast-commit-and-push",
    describe: "fast-commit then push when commits were created",
    load: loadCmd(() => import("./cmd/fast-commit").then((mod) => mod.FastCommitAndPushCommand)),
  },
  {
    command: "plugin <module>",
    describe: "install plugin and update config",
    load: loadCmd(() => import("./cmd/plug").then((mod) => mod.PluginCommand)),
  },
  {
    command: "db",
    describe: "database tools",
    load: loadCmd(() => import("./cmd/db").then((mod) => mod.DbCommand)),
  },
  {
    command: "telemetry",
    describe: "local performance telemetry tools",
    load: loadCmd(() => import("./cmd/telemetry").then((mod) => mod.TelemetryCommand)),
  },
]
