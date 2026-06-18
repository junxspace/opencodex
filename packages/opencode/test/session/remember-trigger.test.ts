import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Memory } from "@opencode-ai/core/memory"
import { Database } from "@opencode-ai/core/database/database"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import memoryFtsMigration from "@opencode-ai/core/database/migration/20260617000000_memory_fts"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { RememberTrigger } from "@/session/remember-trigger"
import { MemoryAuto } from "@/session/memory-auto"
import { testEffect } from "../lib/effect"

const database = Database.layerFromPath(":memory:")
const memory = Memory.layer.pipe(Layer.provide(database))
const it = testEffect(Layer.mergeAll(database, memory))

describe("RememberTrigger", () => {
  test("detects explicit remember requests in Chinese", () => {
    const signal = RememberTrigger.detectFromUserText("记住 DataTable 列要对齐")
    expect(signal?.kind).toBe("user_request")
    expect(signal?.content).toBe("DataTable 列要对齐")
    expect(signal?.target).toBe("project")
  })

  test("detects user rules", () => {
    const signal = RememberTrigger.detectFromUserText("以后都不要用 any 类型")
    expect(signal?.kind).toBe("user_rule")
    expect(signal?.target).toBe("project")
  })

  test("ignores /remember command text", () => {
    expect(RememberTrigger.detectFromUserText("/remember fix alignment")).toBeUndefined()
  })

  test("detects error then success in the same assistant turn", () => {
    const signal = RememberTrigger.detectErrorFix([
      {
        id: "prt_1" as never,
        messageID: "msg_1" as never,
        sessionID: "ses_1" as never,
        type: "tool",
        tool: "bash",
        state: {
          status: "error",
          error: "failed",
          time: { start: 1, end: 2 },
          input: {},
          metadata: {},
        },
      },
      {
        id: "prt_2" as never,
        messageID: "msg_1" as never,
        sessionID: "ses_1" as never,
        type: "tool",
        tool: "edit",
        state: {
          status: "completed",
          title: "ok",
          output: "done",
          time: { start: 3, end: 4 },
          input: {},
          metadata: {},
        },
      },
      {
        id: "prt_3" as never,
        messageID: "msg_1" as never,
        sessionID: "ses_1" as never,
        type: "text",
        text: "Fixed the alignment bug in DataTable.",
      },
    ] as SessionV1.Part[])
    expect(signal?.kind).toBe("error_fix")
    expect(signal?.content).toContain("Fixed the alignment bug")
    expect(signal?.target).toBe("session")
  })

  it.effect("writes dated bullets to session notes", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* DatabaseMigration.applyOnly(db, [memoryFtsMigration])

      const sessionID = "ses_remember_auto"
      const notesPath = yield* RememberTrigger.appendNote(sessionID, "test auto note")
      expect(notesPath).toBe(MemoryPaths.notesPath(sessionID))

      const body = yield* Effect.promise(() => Bun.file(notesPath).text())
      expect(body).toContain("# Session notes")
      expect(body).toContain("test auto note")

      const memory = yield* Memory.Service
      const indexed = yield* memory.get(notesPath)
      expect(indexed?.body).toContain("test auto note")
    }),
  )

  test("drains empty pending signals", () => {
    RememberTrigger.takePendingSignals("ses_pending_empty")
    expect(RememberTrigger.takePendingSignals("ses_pending_empty")).toEqual([])
  })

  test("skips remember auto when remember.auto is false", () => {
    expect(MemoryAuto.rememberAutoEnabled({ remember: { auto: false } })).toBe(false)
  })

  test("skips remember auto when opencode-working-memory is enabled", () => {
    expect(
      MemoryAuto.rememberAutoEnabled({
        plugin: ["opencode-working-memory"],
        remember: { auto: true },
      }),
    ).toBe(false)
  })
})
