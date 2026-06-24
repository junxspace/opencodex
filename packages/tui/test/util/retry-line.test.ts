import { describe, expect, test } from "bun:test"
import { formatRetryLine, retryLineMaxWidth } from "../../src/util/retry-line"

describe("retry-line", () => {
  test("keeps retry suffix visible on narrow terminals", () => {
    const message =
      "Xunfei request failed with Sid: cht000e56a7@dx19efa754328b87f332 code: 11210, msg: NotEnoughCvError"
    const line = formatRetryLine({
      message,
      attempt: 3,
      seconds: 2,
      maxWidth: 60,
    })
    expect(line.text).toEndWith(" [retrying in 2s attempt #3]")
    expect(line.text.length).toBeLessThanOrEqual(60)
    expect(line.expandable).toBeTrue()
  })

  test("reserves space for esc interrupt label", () => {
    expect(retryLineMaxWidth(80, 0)).toBe(80 - "esc interrupt".length - 6)
    expect(retryLineMaxWidth(80, 1)).toBe(80 - "esc again to interrupt".length - 6)
  })
})
