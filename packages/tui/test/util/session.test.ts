import { describe, expect, test } from "bun:test"
import type { AssistantMessage, ToolPart } from "@opencode-ai/sdk/v2"
import {
  isDefaultTitle,
  isForegroundTaskStale,
  isSessionBusy,
  isTaskSpinnerActive,
  shouldPreferHydratedToolPart,
} from "../../src/util/session"

const assistant = (completed?: number): AssistantMessage => ({
  id: "msg_assistant",
  sessionID: "ses_child",
  role: "assistant",
  agent: "general",
  modelID: "model",
  providerID: "test",
  mode: "general",
  parentID: "msg_user",
  path: { cwd: "/tmp", root: "/tmp" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, completed },
})

const tool = (status: ToolPart["state"]["status"]): ToolPart => {
  const base = {
    id: "prt_task",
    sessionID: "ses_parent",
    messageID: "msg_parent",
    type: "tool" as const,
    tool: "task" as const,
    callID: "call_task",
    input: { description: "Migrate pages", prompt: "go", subagent_type: "general" },
    metadata: { sessionId: "ses_child" },
  }

  if (status === "running") {
    return {
      ...base,
      state: { status, input: base.input, metadata: base.metadata, time: { start: 1 } },
    }
  }
  if (status === "pending") {
    return { ...base, state: { status, input: base.input, raw: "" } }
  }
  if (status === "error") {
    return {
      ...base,
      state: { status, input: base.input, metadata: base.metadata, error: "Tool execution aborted", time: { start: 1, end: 2 } },
    }
  }
  return {
    ...base,
    state: { status, input: base.input, title: "Done", output: "ok", metadata: {}, time: { start: 1, end: 2 } },
  }
}

describe("util.session", () => {
  test("recognizes generated parent and child titles", () => {
    expect(isDefaultTitle("New session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("Child session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("New session - custom")).toBeFalse()
  })

  test("treats only busy and retry as active session work", () => {
    expect(isSessionBusy(undefined)).toBeFalse()
    expect(isSessionBusy({ type: "idle" })).toBeFalse()
    expect(isSessionBusy({ type: "stale" })).toBeFalse()
    expect(isSessionBusy({ type: "busy" })).toBeTrue()
    expect(isSessionBusy({ type: "retry" })).toBeTrue()
  })

  test("prefers hydrated tool parts when live state is still active", () => {
    expect(shouldPreferHydratedToolPart(tool("running"), tool("error"))).toBeTrue()
    expect(shouldPreferHydratedToolPart(tool("pending"), tool("completed"))).toBeTrue()
    expect(shouldPreferHydratedToolPart(tool("running"), tool("running"))).toBeFalse()
    expect(shouldPreferHydratedToolPart(tool("completed"), tool("error"))).toBeFalse()
  })

  test("detects stale foreground tasks from child session state", () => {
    expect(
      isForegroundTaskStale({
        partStatus: "running",
        childStatus: { type: "idle" },
      }),
    ).toBeTrue()
    expect(
      isForegroundTaskStale({
        partStatus: "running",
        childStatus: { type: "busy" },
      }),
    ).toBeFalse()
    expect(
      isForegroundTaskStale({
        partStatus: "running",
        childMessages: [assistant(2)],
      }),
    ).toBeTrue()
  })

  test("shows task spinner only for active foreground and background work", () => {
    expect(
      isTaskSpinnerActive({
        partStatus: "running",
        childStatus: { type: "busy" },
      }),
    ).toBeTrue()
    expect(
      isTaskSpinnerActive({
        partStatus: "running",
        childStatus: { type: "idle" },
      }),
    ).toBeFalse()
    expect(
      isTaskSpinnerActive({
        partStatus: "running",
        childMessages: [assistant(2)],
      }),
    ).toBeFalse()
    expect(
      isTaskSpinnerActive({
        partStatus: "error",
        childStatus: { type: "busy" },
      }),
    ).toBeFalse()
    expect(
      isTaskSpinnerActive({
        partStatus: "running",
        background: true,
        childStatus: { type: "busy" },
      }),
    ).toBeTrue()
  })
})
