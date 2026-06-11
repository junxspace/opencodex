import { describe, expect, test } from "bun:test"
import { resolveCliStyle } from "../../src/cli/theme"
import { Style as fallbackStyle } from "../../src/cli/ui"

describe("resolveCliStyle", () => {
  test("uses configured theme colors when forced", async () => {
    const previous = process.env.NO_COLOR
    delete process.env.NO_COLOR
    try {
      const style = await resolveCliStyle({ force: true })
      expect(style.TEXT_SUCCESS_BOLD).toContain("\x1b[")
      expect(style.TEXT_SUCCESS_BOLD).not.toBe(fallbackStyle.TEXT_SUCCESS_BOLD)
    } finally {
      if (previous === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = previous
    }
  })

  test("disables colors when NO_COLOR is set", async () => {
    const previous = process.env.NO_COLOR
    process.env.NO_COLOR = "1"
    try {
      const style = await resolveCliStyle({ force: true })
      expect(style.TEXT_SUCCESS_BOLD).toBe("")
      expect(style.TEXT_DIM).toBe("")
    } finally {
      if (previous === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = previous
    }
  })
})
