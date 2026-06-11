import type { CliRenderer } from "@opentui/core"
import { resetTerminalState } from "./terminal"

export function destroyRenderer(renderer: Pick<CliRenderer, "isDestroyed" | "setTerminalTitle" | "destroy">) {
  if (!renderer.isDestroyed) {
    renderer.setTerminalTitle("")
    resetTerminalState()
    renderer.destroy()
  }
}
