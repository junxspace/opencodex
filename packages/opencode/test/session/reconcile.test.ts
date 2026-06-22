import { describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Layer } from "effect"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { SessionReconcile } from "@/session/reconcile"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const layer = Layer.mergeAll(
  Config.defaultLayer,
  CrossSpawnSpawner.defaultLayer,
  Database.defaultLayer,
  EventV2Bridge.defaultLayer,
  Session.defaultLayer,
  SessionReconcile.defaultLayer,
  SessionRunState.defaultLayer,
  SessionStatus.defaultLayer,
).pipe(Layer.provide(Ripgrep.defaultLayer))

const it = testEffect(layer)

describe("session.reconcile", () => {
  it.instance("marks idle-session running tools interrupted", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const reconcile = yield* SessionReconcile.Service
      const chat = yield* sessions.create({ title: "Stale tools" })
      const userID = MessageID.ascending()
      const assistantID = MessageID.ascending()
      const partID = PartID.ascending()

      yield* sessions.updateMessage({
        id: userID,
        sessionID: chat.id,
        role: "user",
        agent: "build",
        model: { providerID: ref.providerID, modelID: ref.modelID },
        time: { created: Date.now() },
      })
      yield* sessions.updateMessage({
        id: assistantID,
        sessionID: chat.id,
        role: "assistant",
        parentID: userID,
        mode: "build",
        agent: "build",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: partID,
        messageID: assistantID,
        sessionID: chat.id,
        type: "tool",
        tool: "task",
        callID: "call_test",
        state: {
          status: "running",
          input: { description: "Explore", prompt: "go", subagent_type: "explore" },
          time: { start: Date.now() },
        },
      })

      yield* reconcile.reconcile(chat.id)

      const messages = yield* sessions.messages({ sessionID: chat.id })
      const part = messages
        .flatMap((message) => message.parts)
        .find((item): item is SessionV1.ToolPart => item.type === "tool" && item.id === partID)
      expect(part?.state.status).toBe("error")
      if (part?.state.status === "error") {
        expect(part.state.error).toBe("Tool execution aborted")
        expect(part.state.metadata?.interrupted).toBe(true)
      }

      const assistant = messages.at(-1)?.info
      expect(assistant?.role).toBe("assistant")
      if (assistant?.role === "assistant") {
        expect(assistant.error?.name).toBe("MessageAbortedError")
        expect(assistant.time.completed).toBeNumber()
      }
    }),
  )

  it.instance("reports stale sessions with idle status", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const reconcile = yield* SessionReconcile.Service
      const chat = yield* sessions.create({ title: "Stale status" })
      const userID = MessageID.ascending()
      const assistantID = MessageID.ascending()
      const partID = PartID.ascending()

      yield* sessions.updateMessage({
        id: userID,
        sessionID: chat.id,
        role: "user",
        agent: "build",
        model: { providerID: ref.providerID, modelID: ref.modelID },
        time: { created: Date.now() },
      })
      yield* sessions.updateMessage({
        id: assistantID,
        sessionID: chat.id,
        role: "assistant",
        parentID: userID,
        mode: "build",
        agent: "build",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: partID,
        messageID: assistantID,
        sessionID: chat.id,
        type: "tool",
        tool: "task",
        callID: "call_test",
        state: {
          status: "running",
          input: { description: "Explore", prompt: "go", subagent_type: "explore" },
          time: { start: Date.now() },
        },
      })

      expect(yield* reconcile.isStale(chat.id)).toBe(true)
    }),
  )

  it.instance("marks orphan assistant shells interrupted when idle", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const reconcile = yield* SessionReconcile.Service
      const chat = yield* sessions.create({ title: "Orphan shell" })
      const userID = MessageID.ascending()
      const assistantID = MessageID.ascending()

      yield* sessions.updateMessage({
        id: userID,
        sessionID: chat.id,
        role: "user",
        agent: "build",
        model: { providerID: ref.providerID, modelID: ref.modelID },
        time: { created: Date.now() },
      })
      yield* sessions.updateMessage({
        id: assistantID,
        sessionID: chat.id,
        role: "assistant",
        parentID: userID,
        mode: "build",
        agent: "build",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: Date.now() },
      })

      yield* reconcile.reconcile(chat.id)

      const messages = yield* sessions.messages({ sessionID: chat.id })
      const assistant = messages.at(-1)?.info
      expect(assistant?.role).toBe("assistant")
      if (assistant?.role === "assistant") {
        expect(assistant.error?.name).toBe("MessageAbortedError")
        expect(assistant.time.completed).toBeNumber()
      }
    }),
  )

  it.instance("keeps compaction failure errors instead of marking them aborted", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const reconcile = yield* SessionReconcile.Service
      const chat = yield* sessions.create({ title: "Compaction failure" })
      const userID = MessageID.ascending()
      const assistantID = MessageID.ascending()

      yield* sessions.updateMessage({
        id: userID,
        sessionID: chat.id,
        role: "user",
        agent: "build",
        model: { providerID: ref.providerID, modelID: ref.modelID },
        time: { created: Date.now() },
      })
      yield* sessions.updateMessage({
        id: assistantID,
        sessionID: chat.id,
        role: "assistant",
        parentID: userID,
        mode: "compaction",
        agent: "compaction",
        summary: true,
        finish: "error",
        error: new SessionV1.ContextOverflowError({
          message: "Session too large to compact - context exceeds model limit even after stripping media",
        }),
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: Date.now() },
      })

      yield* reconcile.reconcile(chat.id)

      const messages = yield* sessions.messages({ sessionID: chat.id })
      const assistant = messages.at(-1)?.info
      expect(assistant?.role).toBe("assistant")
      if (assistant?.role === "assistant") {
        expect(assistant.error?.name).toBe("ContextOverflowError")
        expect(assistant.time.completed).toBeUndefined()
      }
    }),
  )

  it.instance("skips orphan assistant cleanup while session is busy", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const reconcile = yield* SessionReconcile.Service
      const sessionStatus = yield* SessionStatus.Service
      const chat = yield* sessions.create({ title: "Busy orphan shell" })
      const userID = MessageID.ascending()
      const assistantID = MessageID.ascending()

      yield* sessions.updateMessage({
        id: userID,
        sessionID: chat.id,
        role: "user",
        agent: "build",
        model: { providerID: ref.providerID, modelID: ref.modelID },
        time: { created: Date.now() },
      })
      yield* sessions.updateMessage({
        id: assistantID,
        sessionID: chat.id,
        role: "assistant",
        parentID: userID,
        mode: "build",
        agent: "build",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: Date.now() },
      })
      yield* sessionStatus.set(chat.id, { type: "busy" })

      yield* reconcile.reconcile(chat.id)

      const messages = yield* sessions.messages({ sessionID: chat.id })
      const assistant = messages.at(-1)?.info
      expect(assistant?.role).toBe("assistant")
      if (assistant?.role === "assistant") {
        expect(assistant.time.completed).toBeUndefined()
      }
    }),
  )

  it.instance("reconciles stale tools when the runner goes idle", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const reconcile = yield* SessionReconcile.Service
      const run = yield* SessionRunState.Service
      const chat = yield* sessions.create({ title: "Idle reconcile" })
      const userID = MessageID.ascending()
      const assistantID = MessageID.ascending()
      const partID = PartID.ascending()

      yield* sessions.updateMessage({
        id: userID,
        sessionID: chat.id,
        role: "user",
        agent: "build",
        model: { providerID: ref.providerID, modelID: ref.modelID },
        time: { created: Date.now() },
      })
      yield* sessions.updateMessage({
        id: assistantID,
        sessionID: chat.id,
        role: "assistant",
        parentID: userID,
        mode: "build",
        agent: "build",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: partID,
        messageID: assistantID,
        sessionID: chat.id,
        type: "tool",
        tool: "write",
        callID: "call_orphan",
        state: {
          status: "pending",
          input: {},
          raw: "",
        },
      })

      expect(yield* reconcile.isStale(chat.id)).toBe(true)

      yield* run.ensureRunning(
        chat.id,
        Effect.gen(function* () {
          const msgs = yield* sessions.messages({ sessionID: chat.id }).pipe(Effect.orDie)
          return msgs.at(-1)!
        }),
        Effect.gen(function* () {
          const msgs = yield* sessions.messages({ sessionID: chat.id }).pipe(Effect.orDie)
          return msgs.at(-1)!
        }),
      )

      expect(yield* reconcile.isStale(chat.id)).toBe(false)
      const messages = yield* sessions.messages({ sessionID: chat.id })
      const part = messages
        .flatMap((message) => message.parts)
        .find((item): item is SessionV1.ToolPart => item.type === "tool" && item.id === partID)
      expect(part?.state.status).toBe("error")
      if (part?.state.status === "error") {
        expect(part.state.error).toBe("Tool execution aborted")
        expect(part.state.metadata?.interrupted).toBe(true)
      }
      const assistant = messages.at(-1)?.info
      expect(assistant?.role).toBe("assistant")
      if (assistant?.role === "assistant") {
        expect(assistant.time.completed).toBeNumber()
      }
    }),
  )
})
