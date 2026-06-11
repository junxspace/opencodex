import { describe, expect, test } from "bun:test"
import { invalidToolRepair } from "../../src/session/llm"

describe("session.llm.invalidToolRepair", () => {
  test("repairs tool call with JSON input matching invalid tool schema", () => {
    const repaired = invalidToolRepair("Read", "File path does not exist")
    expect(repaired.toolName).toBe("invalid")
    const input = JSON.parse(repaired.input)
    expect(input.tool).toBe("Read")
    expect(input.error).toBe("File path does not exist")
  })
})
