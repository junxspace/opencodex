import { describe, expect, test } from "bun:test"
import { Permission } from "../../src/permission"
import { Question } from "../../src/question"
import { Session } from "../../src/session/session"
import { SessionStatus } from "../../src/session/status"
import {
  formatTime,
  isAbortError,
  notificationEvent,
  resolveDispatchStatus,
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

describe("notification time", () => {
  test("formatTime uses local date parts", () => {
    expect(formatTime(new Date(2026, 5, 15, 14, 30, 45))).toBe("2026-06-15 14:30:45")
  })
})

describe("notification terminal status", () => {
  test("drops user interrupt terminal pairs", () => {
    expect(resolveTerminalStatus("session_error", "completed")).toBeNull()
    expect(resolveTerminalStatus("completed", "session_error")).toBeNull()
  })

  test("upgrades completed to interrupted when abort arrives late", () => {
    expect(resolveTerminalStatus("completed", "interrupted")).toBe("interrupted")
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
    const state = { wasBusy: false, hadError: false, hadInterrupt: false }

    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "busy" } }, state)).toBeNull()
    expect(state.wasBusy).toBe(true)

    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, state)).toEqual({
      event: "task_completed",
      status: "completed",
    })

    const errored = { wasBusy: false, hadError: false, hadInterrupt: false }
    notificationEvent(Session.Event.Error.type, { error: { name: "ProviderError", message: "boom" } }, errored)
    errored.wasBusy = true
    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, errored)).toEqual({
      event: "task_error",
      status: "error",
    })

    const interrupted = { wasBusy: false, hadError: false, hadInterrupt: false }
    notificationEvent(
      Session.Event.Error.type,
      { error: { name: "MessageAbortedError", message: "Aborted" } },
      interrupted,
    )
    interrupted.wasBusy = true
    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, interrupted)).toEqual({
      event: "task_interrupted",
      status: "interrupted",
    })
  })

  test("detects user abort errors", () => {
    expect(isAbortError({ name: "MessageAbortedError", message: "Aborted" })).toBe(true)
    expect(isAbortError({ name: "ProviderError", message: "boom" })).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })

  test("skips session_error for user abort", () => {
    const state = { wasBusy: false, hadError: false, hadInterrupt: false }
    expect(
      notificationEvent(
        Session.Event.Error.type,
        { error: { name: "MessageAbortedError", message: "Aborted" } },
        state,
      ),
    ).toBeNull()
    expect(state.hadInterrupt).toBe(true)
    expect(state.hadError).toBe(false)
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
    expect(shouldNotify(cfg(), "task_interrupted")).toBe(true)
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

  test("disabled task_interrupted suppresses interrupt notifications", () => {
    const item = cfg({ disabledEvents: ["task_interrupted"] })

    expect(shouldNotify(item, "task_interrupted")).toBe(false)
    expect(shouldNotify(item, "task_completed")).toBe(true)
  })

  test("resolveDispatchStatus leaves completed when no abort signal", () => {
    expect(resolveDispatchStatus("ses_missing", "completed")).toBe("completed")
    expect(resolveDispatchStatus("ses_missing", "interrupted")).toBe("interrupted")
  })

  test("does not upgrade completed using reconcile abort markers in the database", () => {
    expect(resolveDispatchStatus("ses_after_compaction", "completed")).toBe("completed")
  })

  test("disabled task_interrupted still allows completed notifications", () => {
    const item = cfg({
      enabledEvents: ["task_completed", "task_error"],
      disabledEvents: ["task_interrupted"],
    })
    expect(shouldNotify(item, "task_completed")).toBe(true)
    expect(shouldNotify(item, "task_interrupted")).toBe(false)
  })

  test("compaction failure error leads to task_error on idle", () => {
    const state = { wasBusy: false, hadError: false, hadInterrupt: false }
    notificationEvent(
      Session.Event.Error.type,
      {
        error: {
          name: "ContextOverflowError",
          data: { message: "Session too large to compact - context exceeds model limit even after stripping media" },
        },
      },
      state,
    )
    expect(state.hadError).toBe(true)
    state.wasBusy = true
    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, state)).toEqual({
      event: "task_error",
      status: "error",
    })
  })

  test("completed dispatch stays completed when compaction already recorded an error", () => {
    const state = { wasBusy: false, hadError: false, hadInterrupt: false }
    notificationEvent(
      Session.Event.Error.type,
      {
        error: {
          name: "ContextOverflowError",
          data: { message: "Session too large to compact - context exceeds model limit even after stripping media" },
        },
      },
      state,
    )
    state.wasBusy = true
    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, state)).toEqual({
      event: "task_error",
      status: "error",
    })
    expect(resolveDispatchStatus("ses_compaction_failed", "error")).toBe("error")
  })

  test("compaction success leads to task_completed on idle", () => {
    const state = { wasBusy: false, hadError: false, hadInterrupt: false }

    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "busy" } }, state)).toBeNull()
    expect(state.wasBusy).toBe(true)

    expect(notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, state)).toEqual({
      event: "task_completed",
      status: "completed",
    })
    expect(resolveDispatchStatus("ses_after_compaction", "completed")).toBe("completed")
  })

  test("compaction success still notifies completed when task_interrupted is disabled", () => {
    const item = cfg({
      enabledEvents: ["task_completed", "task_error", "session_error"],
      disabledEvents: ["task_interrupted"],
    })
    const state = { wasBusy: false, hadError: false, hadInterrupt: false }

    notificationEvent(SessionStatus.Event.Status.type, { status: { type: "busy" } }, state)
    const result = notificationEvent(SessionStatus.Event.Status.type, { status: { type: "idle" } }, state)

    expect(result).toEqual({ event: "task_completed", status: "completed" })
    expect(shouldNotify(item, result!.event)).toBe(true)
    expect(resolveDispatchStatus("ses_after_compaction", result!.status)).toBe("completed")
  })
})
