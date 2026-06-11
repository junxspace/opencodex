import { afterEach, expect, test } from "bun:test"
import { flushTerminalInput, kitty, sequences, withReset } from "../../src/util/terminal"

const keys = ["TERM_PROGRAM", "MSYSTEM", "OPENCODE_DISABLE_KITTY_KEYBOARD", "OPENCODE_ENABLE_KITTY_KEYBOARD"] as const
type Key = (typeof keys)[number]
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<Key, string | undefined>

function env(input: Partial<Record<Key, string | undefined>>) {
  for (const key of keys) {
    const value = input[key]
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

function restore() {
  for (const key of keys) {
    const value = saved[key]
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

afterEach(() => {
  restore()
})

test("enables Kitty keyboard reset by default", () => {
  env({})

  expect(kitty()).toBe(true)
  expect(sequences()).toContain("\x1b[<u")
})

test("disables Kitty keyboard in mintty", () => {
  env({ TERM_PROGRAM: "mintty" })

  expect(kitty()).toBe(false)
  expect(sequences()).not.toContain("\x1b[<u")
})

test("flushes queued terminal input", () => {
  const calls: [number, number][] = []

  flushTerminalInput({ isTTY: true, fd: 42 }, (fd, queue) => {
    calls.push([fd, queue])
    return 0
  })

  expect(calls).toEqual([[42, 0]])
})

test("resets after wrapped cleanup completes", async () => {
  const calls: string[] = []

  await withReset(
    async () => {
      calls.push("destroy")
    },
    () => {
      calls.push("reset")
    },
  )

  expect(calls).toEqual(["destroy", "reset"])
})
