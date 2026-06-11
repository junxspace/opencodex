import { dlopen } from "bun:ffi"
import fs from "node:fs"

const TCIFLUSH = 0
const lib = () =>
  dlopen(process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6", {
    tcflush: { args: ["i32", "i32"], returns: "i32" },
  })

type Flush = ReturnType<typeof lib>
type Input = { isTTY?: boolean; fd: number }
type Tcflush = (fd: number, queue: number) => number

let handle: Flush | undefined

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export function kitty() {
  if (truthy("OPENCODE_DISABLE_KITTY_KEYBOARD")) return false
  if (truthy("OPENCODE_ENABLE_KITTY_KEYBOARD")) return true

  const term = process.env.TERM_PROGRAM?.toLowerCase()
  const system = process.env.MSYSTEM?.toLowerCase()

  if (term === "mintty") return false
  if (system) return false

  return true
}

export function sequences() {
  return [
    "\x1b[?9l",
    "\x1b[?1000l",
    "\x1b[?1001l",
    "\x1b[?1002l",
    "\x1b[?1003l",
    "\x1b[?1005l",
    "\x1b[?1006l",
    "\x1b[?1007l",
    "\x1b[?1015l",
    "\x1b[?1016l",
    "\x1b[?2004l",
    "\x1b[?2026l",
    "\x1b[?1004l",
    "\x1b[?1l",
    "\x1b[?1049l",
    "\x1b[?1048l",
    "\x1b[?47l",
    "\x1b[?1047l",
    "\x1b[>",
    "\x1b[?66l",
    "\x1b[>4;0m",
    ...(kitty() ? ["\x1b[<u"] : []),
    "\x1b[?25h",
    "\x1b[0m",
  ]
}

export function flushTerminalInput(input: Input = process.stdin, flush?: Tcflush) {
  if (process.platform !== "darwin" && process.platform !== "linux") return
  if (!input.isTTY) return

  try {
    const tcflush =
      flush ??
      (() => {
        handle ??= lib()
        return handle.symbols.tcflush
      })()
    tcflush(input.fd, TCIFLUSH)
  } catch (err) {
    console.error("flushTerminalInput failed", err)
  }
}

export function resetTerminalState() {
  try {
    fs.writeSync(process.stdout.fd, sequences().join(""))
    flushTerminalInput()
  } catch (err) {
    console.error("resetTerminalState failed", err)
  }
}

export async function withReset<T>(fn: () => Promise<T>, reset = resetTerminalState) {
  try {
    return await fn()
  } finally {
    reset()
  }
}
