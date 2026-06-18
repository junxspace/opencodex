export function formatDurationMs(input: number) {
  if (input <= 0) return ""
  if (input < 60_000) return `${(input / 1000).toFixed(1)}s`
  if (input < 3_600_000) {
    const minutes = Math.floor(input / 60_000)
    const seconds = Math.floor((input % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
  }
  if (input < 86_400_000) {
    const hours = Math.floor(input / 3_600_000)
    const minutes = Math.floor((input % 3_600_000) / 60_000)
    return `${hours}h ${minutes}m`
  }
  const hours = Math.floor(input / 3_600_000)
  const days = Math.floor((input % 3_600_000) / 86_400_000)
  return `${days}d ${hours}h`
}

export function toolTiming(state: { status: string; time?: { start: number; end?: number } }) {
  if (state.status === "running" && state.time?.start) {
    return { start: state.time.start, end: undefined as number | undefined }
  }
  if ((state.status === "completed" || state.status === "error") && state.time?.start && state.time.end) {
    return { start: state.time.start, end: state.time.end }
  }
}
