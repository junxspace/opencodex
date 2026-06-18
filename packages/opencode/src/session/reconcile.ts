import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Session } from "./session"
import { SessionID } from "./schema"
import { SessionStatus } from "./status"
import { Effect, Layer, Context } from "effect"

export interface Interface {
  readonly reconcile: (sessionID: SessionID) => Effect.Effect<void>
  readonly reconcileTree: (sessionID: SessionID) => Effect.Effect<void>
  readonly reconcileProject: () => Effect.Effect<void>
  readonly isStale: (sessionID: SessionID) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionReconcile") {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function staleTool(part: SessionV1.Part): part is SessionV1.ToolPart {
  return part.type === "tool" && (part.state.status === "running" || part.state.status === "pending")
}

function interruptToolPart(part: SessionV1.ToolPart) {
  const end = Date.now()
  const metadata = "metadata" in part.state && isRecord(part.state.metadata) ? part.state.metadata : {}
  return {
    ...part,
    state: {
      ...part.state,
      status: "error" as const,
      error: "Tool execution aborted",
      metadata: { ...metadata, interrupted: true },
      time: { start: "time" in part.state ? part.state.time.start : end, end },
    },
  }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const status = yield* SessionStatus.Service

    const reconcile = Effect.fn("SessionReconcile.reconcile")(function* (sessionID: SessionID) {
      const current = yield* status.get(sessionID)
      if (current.type === "busy") return

      const messages = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const stale = messages.flatMap((message) => message.parts.filter(staleTool))
      if (stale.length === 0) return

      yield* Effect.forEach(
        stale,
        (part) => sessions.updatePart(interruptToolPart(part)),
        { concurrency: "unbounded", discard: true },
      )

      const last = messages.at(-1)
      if (last?.info.role !== "assistant" || last.info.time.completed) return

      yield* sessions.updateMessage({
        ...last.info,
        finish: "error",
        error: new SessionV1.AbortedError({ message: "Interrupted" }),
        time: {
          created: last.info.time.created,
          completed: Date.now(),
        },
      })
    })

    const reconcileTree: (sessionID: SessionID) => Effect.Effect<void> = (sessionID) =>
      Effect.gen(function* () {
        yield* reconcile(sessionID)
        const children = yield* sessions.children(sessionID).pipe(Effect.orDie)
        yield* Effect.forEach(children, (child) => reconcileTree(child.id), {
          concurrency: "unbounded",
          discard: true,
        })
      })

    const reconcileProject = Effect.fn("SessionReconcile.reconcileProject")(function* () {
      const list = yield* sessions.list()
      yield* Effect.forEach(list, (item) => reconcile(item.id), { concurrency: "unbounded", discard: true })
    })

    const isStale = Effect.fn("SessionReconcile.isStale")(function* (sessionID: SessionID) {
      const current = yield* status.get(sessionID)
      if (current.type === "busy") return false
      const messages = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      return messages.some((message) => message.parts.some(staleTool))
    })

    yield* Effect.forkScoped(reconcileProject().pipe(Effect.catch(() => Effect.void)))

    return Service.of({ reconcile, reconcileTree, reconcileProject, isStale })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Session.defaultLayer), Layer.provide(SessionStatus.defaultLayer))

export const node = LayerNode.make(layer, [Session.node, SessionStatus.node])

export * as SessionReconcile from "./reconcile"
