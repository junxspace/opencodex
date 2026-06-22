import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { runningToolStart } from "../../src/session/tools"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

const tool = (state: SessionV1.ToolPart["state"]): SessionV1.ToolPart => ({
  id: PartID.ascending(),
  sessionID: SessionID.descending(),
  messageID: MessageID.ascending(),
  type: "tool",
  tool: "bash",
  callID: "call_test",
  state,
})

describe("session.tools", () => {
  test("runningToolStart keeps the original start time across metadata updates", () => {
    expect(runningToolStart(tool({ status: "running", input: {}, time: { start: 1_000 } }))).toBe(1_000)
  })

  test("runningToolStart initializes start time for pending tools", () => {
    const before = Date.now()
    const start = runningToolStart(tool({ status: "pending", input: {}, raw: "" }))
    expect(start).toBeGreaterThanOrEqual(before)
    expect(start).toBeLessThanOrEqual(Date.now())
  })
})
