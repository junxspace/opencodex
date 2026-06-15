import { Flag } from "../flag/flag"

function enabled() {
  return Flag.OPENCODE_STARTUP_TRACE
}

function write(scope: string, label: string, ms: number, detail?: Record<string, unknown>) {
  const extra = detail ? ` ${JSON.stringify(detail)}` : ""
  const prefix = scope ? `[startup ${scope}` : "[startup"
  process.stderr.write(`${prefix} +${ms.toFixed(0)}ms] ${label}${extra}\n`)
}

export function mark(label: string, detail?: Record<string, unknown>) {
  if (!enabled()) return
  write("", label, performance.now(), detail)
}

export function child(scope: string) {
  const origin = performance.now()
  return (label: string, detail?: Record<string, unknown>) => {
    if (!enabled()) return
    write(scope, label, performance.now() - origin, detail)
  }
}

export * as StartupTrace from "./startup-trace"
