import { formatDuration } from "./format"
import { Locale } from "./locale"

export function retryLineMaxWidth(terminalWidth: number, interrupt: number) {
  const esc = interrupt > 0 ? "esc again to interrupt" : "esc interrupt"
  return Math.max(20, terminalWidth - esc.length - 6)
}

export function formatRetryLine(input: {
  message: string
  attempt: number
  seconds: number
  maxWidth: number
}) {
  const message =
    input.message.includes("exceeded your current quota") && input.message.includes("gemini")
      ? "gemini is way too hot right now"
      : input.message
  const duration = formatDuration(input.seconds)
  const suffix = ` [retrying${duration ? ` in ${duration}` : ""} attempt #${input.attempt}]`
  const maxMessage = Math.max(8, input.maxWidth - suffix.length)
  const truncated = message.length > maxMessage
  const display = truncated ? Locale.truncateMiddle(message, maxMessage) : message
  return {
    text: display + suffix,
    expandable: truncated || message.length > 120,
    message,
  }
}
