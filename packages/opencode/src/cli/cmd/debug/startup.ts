import { EOL } from "os"
import { cmd } from "../cmd"
import { StartupTrace } from "@opencode-ai/core/util/startup-trace"

export const StartupCommand = cmd({
  command: "startup",
  describe: "print startup timing",
  builder: (yargs) => yargs,
  handler() {
    StartupTrace.mark("debug.startup")
    process.stdout.write(performance.now().toString() + EOL)
  },
})
