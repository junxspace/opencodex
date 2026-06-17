import { describe, expect, test } from "bun:test"
import type { Message } from "@opencode-ai/sdk/v2"
import { turnDiffs } from "../../src/util/turn-diffs"

function user(
  id: string,
  diffs?: Array<{ file?: string; additions: number; deletions: number }>,
): Message {
  return {
    id,
    sessionID: "ses_test",
    role: "user",
    time: { created: 1 },
    agent: "build",
    model: { providerID: "test", modelID: "model" },
    summary: diffs ? { diffs } : undefined,
  }
}

function assistant(id: string): Message {
  return {
    id,
    sessionID: "ses_test",
    role: "assistant",
    time: { created: 1, completed: 2 },
    parentID: "msg_user",
    modelID: "model",
    providerID: "test",
    mode: "build",
    agent: "build",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

describe("turnDiffs", () => {
  test("returns empty when there are no messages", () => {
    expect(turnDiffs({ messages: undefined })).toEqual([])
    expect(turnDiffs({ messages: [] })).toEqual([])
  })

  test("returns empty when there is no user message", () => {
    expect(turnDiffs({ messages: [assistant("msg_asst")] })).toEqual([])
  })

  test("returns the last user turn diffs", () => {
    const messages = [
      user("msg_user_1", [{ file: "a.ts", additions: 1, deletions: 0 }]),
      assistant("msg_asst_1"),
      user("msg_user_2", [{ file: "b.ts", additions: 2, deletions: 1 }]),
    ]

    expect(turnDiffs({ messages })).toEqual([{ file: "b.ts", additions: 2, deletions: 1 }])
  })

  test("ignores diff rows without a file path", () => {
    const messages = [user("msg_user", [{ additions: 1, deletions: 0 }, { file: "ok.ts", additions: 3, deletions: 0 }])]

    expect(turnDiffs({ messages })).toEqual([{ file: "ok.ts", additions: 3, deletions: 0 }])
  })

  test("respects revert message boundaries", () => {
    const messages = [
      user("msg_user_1", [{ file: "kept.ts", additions: 1, deletions: 0 }]),
      assistant("msg_asst_1"),
      user("msg_user_2", [{ file: "reverted.ts", additions: 9, deletions: 0 }]),
    ]

    expect(turnDiffs({ messages, revertMessageID: "msg_user_2" })).toEqual([
      { file: "kept.ts", additions: 1, deletions: 0 },
    ])
  })

  test("returns empty when the last visible user turn has no summary diffs", () => {
    const messages = [user("msg_user_1"), assistant("msg_asst_1"), user("msg_user_2")]

    expect(turnDiffs({ messages })).toEqual([])
  })
})
