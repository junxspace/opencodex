import { describe, expect, test } from "bun:test"
import { Permission } from "../../src/permission"
import { Question } from "../../src/question"
import { Session } from "../../src/session/session"
import { SessionStatus } from "../../src/session/status"
import {
  notificationEvent,
  resolveTerminalStatus,
  shouldNotify,
  shouldSkipTerminalSession,
  type NotificationConfig,
} from "../../src/notification/webhook"

const cfg = (input: Partial<NotificationConfig> = {}): NotificationConfig => ({
  webhookUrl: "https://example.com/webhook",
  enabled: true,
  action: "webhook",
  ...input,
})

describe("notification terminal status", () => {
  test("drops user interrupt terminal pairs", () => {
    expect(resolveTerminalStatus("session_error", "completed")).toBeNull()
    expect(resolveTerminalStatus("completed", "session_error")).toBeNull()
  })

  test("keeps real terminal statuses", () => {
    expect(resolveTerminalStatus(undefined, "completed")).toBe("completed")
    expect(resolveTerminalStatus(undefined, "interrupted")).toBe("interrupted")
    expect(resolveTerminalStatus(undefined, "session_error")).toBe("session_error")
    expect(resolveTerminalStatus(undefined, "error")).toBe("error")
  })
})

describe("notification events", () => {
  test("skips terminal child session notifications", () => {
    expect(shouldSkipTerminalSession("task_completed", { parentID: "ses_parent" })).toBe(true)
    expect(shouldSkipTerminalSession("task_error", { parentID: "ses_parent" })).toBe(true)
    expect(shouldSkipTerminalSession("task_interrupted", { parentID: "ses_parent" })).toBe(true)
    expect(shouldSkipTerminalSession("permission_required", { parentID: "ses_parent" })).toBe(false)
    expect(shouldSkipTerminalSession("task_completed", { parentID: undefined })).toBe(false)
  })

  test("maps session status transitions to user events", () => {
    const state = { wasBusy: false, hadError: false }

    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "busy" } }, state)).toBeNull()
    expect(state.wasBusy).toBe(true)

    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, state)).toEqual({
      event: "task_completed",
      status: "completed",
    })

    const errored = { wasBusy: false, hadError: false }
    notificationEvent(Session.Event.Error.type, {}, errored)
    errored.wasBusy = true
    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, errored)).toEqual({
      event: "task_error",
      status: "error",
    })
  })

  test("maps permission and question events", () => {
    expect(notificationEvent(Permission.Event.Asked.type, {})).toEqual({
      event: "permission_required",
      status: "waiting",
    })
    expect(notificationEvent(Question.Event.Asked.type, {})).toEqual({
      event: "question_required",
      status: "waiting",
    })
    expect(notificationEvent(Session.Event.Error.type, {})).toEqual({
      event: "session_error",
      status: "session_error",
    })
  })

  test("uses default event set", () => {
    expect(shouldNotify(cfg(), "task_completed")).toBe(true)
    expect(shouldNotify(cfg(), "task_error")).toBe(true)
    expect(shouldNotify(cfg(), "permission_required")).toBe(true)
    expect(shouldNotify(cfg(), "question_required")).toBe(true)
    expect(shouldNotify(cfg(), "session_error")).toBe(true)
    expect(shouldNotify(cfg(), "task_interrupted")).toBe(false)
  })

  test("supports enabled_events allowlist", () => {
    const item = cfg({ enabledEvents: ["task_completed"] })

    expect(shouldNotify(item, "task_completed")).toBe(true)
    expect(shouldNotify(item, "task_error")).toBe(false)
  })

  test("supports empty enabled_events", () => {
    expect(shouldNotify(cfg({ enabledEvents: [] }), "task_completed")).toBe(false)
  })

  test("disabled_events wins over enabled_events", () => {
    const item = cfg({ enabledEvents: ["task_completed", "task_error"], disabledEvents: ["task_completed"] })

    expect(shouldNotify(item, "task_completed")).toBe(false)
    expect(shouldNotify(item, "task_error")).toBe(true)
  })
})
