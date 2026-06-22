import type { Message, ToolPart } from "@opencode-ai/sdk/v2"

export function isDefaultTitle(title: string) {
  return /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(title)
}

export function isSessionBusy(status: { type: string } | undefined) {
  return status?.type === "busy" || status?.type === "retry"
}

export function shouldPreferHydratedToolPart(current: ToolPart, server: ToolPart) {
  const liveActive = current.state.status === "running" || current.state.status === "pending"
  const serverSettled = server.state.status === "completed" || server.state.status === "error"
  return liveActive && serverSettled
}

export function isForegroundTaskStale(input: {
  partStatus: string
  background?: boolean
  childStatus?: { type: string }
  childMessages?: readonly Message[]
}) {
  if (input.partStatus !== "running" || input.background === true) return false
  if (input.childStatus?.type === "idle") return true
  if (input.childStatus?.type === "busy" || input.childStatus?.type === "retry") return false
  const lastAssistant = input.childMessages?.findLast((message) => message.role === "assistant")
  return lastAssistant?.role === "assistant" && lastAssistant.time.completed !== undefined
}

export function isTaskSpinnerActive(input: {
  partStatus: string
  background?: boolean
  childStatus?: { type: string }
  childMessages?: readonly Message[]
}) {
  if (input.background === true) {
    return input.childStatus !== undefined && input.childStatus.type !== "idle"
  }
  if (input.partStatus !== "running") return false
  if (isForegroundTaskStale(input)) return false
  return true
}
