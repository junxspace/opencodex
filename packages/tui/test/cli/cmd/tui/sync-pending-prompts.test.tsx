/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import type { GlobalEvent, QuestionRequest } from "@opencode-ai/sdk/v2"
import { directory, json, mount, wait } from "./sync-fixture"

const sessionID = "session-1"

function globalEvent(payload: GlobalEvent["payload"]): GlobalEvent {
  return {
    directory,
    project: "proj_test",
    payload,
  }
}

function question(id: string): QuestionRequest {
  return {
    id,
    sessionID,
    questions: [{ question: "Continue?", header: "Confirm", options: [{ label: "Yes", description: "Proceed" }] }],
    tool: { messageID: "msg-1", callID: `call-${id}` },
  }
}

describe("tui sync pending prompts", () => {
  test("refreshPending clears stale questions when question.list is empty", async () => {
    const { app, emit, sync } = await mount()
    try {
      emit(globalEvent({ id: "event-1", type: "question.asked", properties: question("question-1") }))
      await wait(() => (sync.data.question[sessionID]?.length ?? 0) === 1)
      await sync.refreshPending()
      expect(sync.data.question[sessionID] ?? []).toEqual([])
    } finally {
      app.renderer.destroy()
    }
  })

  test("bootstrap restores pending questions from question.list", async () => {
    const pending = question("question-2")
    const { app, sync } = await mount((url) => {
      if (url.pathname === "/question") return json([pending])
    })
    try {
      expect(sync.data.question[sessionID]).toEqual([pending])
    } finally {
      app.renderer.destroy()
    }
  })

  test("message.part.updated clears stale questions when the tool settles", async () => {
    const { app, emit, sync } = await mount()
    try {
      emit(globalEvent({ id: "event-1", type: "question.asked", properties: question("question-3") }))
      await wait(() => (sync.data.question[sessionID]?.length ?? 0) === 1)
      emit(
        globalEvent({
          id: "event-2",
          type: "message.part.updated",
          properties: {
            sessionID,
            time: Date.now(),
            part: {
              id: "prt-1",
              sessionID,
              messageID: "msg-1",
              type: "tool",
              tool: "question",
              callID: "call-question-3",
              state: {
                status: "error",
                input: {},
                error: "The user dismissed this question",
                time: { start: 0, end: 1 },
              },
            },
          },
        }),
      )
      await wait(() => (sync.data.question[sessionID]?.length ?? 0) === 0)
    } finally {
      app.renderer.destroy()
    }
  })

  test("server.connected refreshes pending questions", async () => {
    const pending = question("question-4")
    const questions: QuestionRequest[] = []
    const { app, emit, sync } = await mount((url) => {
      if (url.pathname === "/question") return json(questions)
    })
    try {
      emit(globalEvent({ id: "event-1", type: "question.asked", properties: question("question-stale") }))
      await wait(() => (sync.data.question[sessionID]?.length ?? 0) === 1)
      questions.push(pending)
      emit(globalEvent({ id: "event-2", type: "server.connected", properties: {} }))
      await Bun.sleep(20)
      await wait(() => sync.data.question[sessionID]?.[0]?.id === pending.id)
    } finally {
      app.renderer.destroy()
    }
  })

  test("server.connected clears stale session status", async () => {
    const { app, emit, sync } = await mount()
    try {
      emit(
        globalEvent({
          id: "event-1",
          type: "session.status",
          properties: { sessionID, status: { type: "busy" } },
        }),
      )
      await wait(() => sync.data.session_status[sessionID]?.type === "busy")
      emit(globalEvent({ id: "event-2", type: "server.connected", properties: {} }))
      await wait(() => sync.data.session_status[sessionID] === undefined)
    } finally {
      app.renderer.destroy()
    }
  })
})
