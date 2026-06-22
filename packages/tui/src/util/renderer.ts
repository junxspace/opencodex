import type { CliRenderer } from "@opentui/core"
import { resetTerminalState } from "./terminal"

export function destroyRenderer(renderer: Pick<CliRenderer, "isDestroyed" | "setTerminalTitle" | "destroy">) {
  renderer.setTerminalTitle("")
  resetTerminalState()
  if (renderer.isDestroyed) return
  renderer.destroy()
}
