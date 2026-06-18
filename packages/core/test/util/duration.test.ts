import { describe, expect, test } from "bun:test"
import { formatDurationMs, toolTiming } from "../../src/util/duration"

describe("formatDurationMs", () => {
  test("formats sub-second durations as tenths of a second", () => {
    expect(formatDurationMs(0)).toBe("")
    expect(formatDurationMs(250)).toBe("0.3s")
    expect(formatDurationMs(999)).toBe("1.0s")
  })

  test("formats second durations with one decimal", () => {
    expect(formatDurationMs(1000)).toBe("1.0s")
    expect(formatDurationMs(2300)).toBe("2.3s")
    expect(formatDurationMs(59_999)).toBe("60.0s")
  })

  test("formats minute durations", () => {
    expect(formatDurationMs(60_000)).toBe("1m 0s")
    expect(formatDurationMs(90_000)).toBe("1m 30s")
  })
})

describe("toolTiming", () => {
  test("returns running start time", () => {
    expect(toolTiming({ status: "running", time: { start: 100 } })).toEqual({ start: 100, end: undefined })
  })

  test("returns completed interval", () => {
    expect(toolTiming({ status: "completed", time: { start: 100, end: 250 } })).toEqual({ start: 100, end: 250 })
  })

  test("ignores pending state", () => {
    expect(toolTiming({ status: "pending" })).toBeUndefined()
  })
})
