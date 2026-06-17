import { Identifier } from "@/id/id"
import { Effect, Queue } from "effect"
import * as Stream from "effect/Stream"

export type GlobalEvent = {
  directory?: string
  project?: string
  workspace?: string
  payload: any
}

type Listener = (event: GlobalEvent) => void
const listeners = new Set<Listener>()

function prepare(event: GlobalEvent) {
  if (event.payload && typeof event.payload === "object" && !("id" in event.payload)) {
    event.payload.id = event.payload.syncEvent?.id ?? Identifier.create("evt", "ascending")
  }
}

export const GlobalBus = {
  on(_event: "event", listener: Listener) {
    listeners.add(listener)
    return GlobalBus
  },
  off(_event: "event", listener: Listener) {
    listeners.delete(listener)
  },
  emit(_event: "event", event: GlobalEvent) {
    prepare(event)
    for (const listener of listeners) listener(event)
    return listeners.size > 0
  },
  listenerCount(_event: "event") {
    return listeners.size
  },
}

export function stream(filter?: (event: GlobalEvent) => boolean) {
  return Effect.gen(function* () {
    const queue = yield* Queue.unbounded<GlobalEvent>()
    const handler = (event: GlobalEvent) => {
      if (filter && !filter(event)) return
      Queue.offerUnsafe(queue, event)
    }
    yield* Effect.sync(() => GlobalBus.on("event", handler))
    yield* Effect.addFinalizer(() => Effect.sync(() => GlobalBus.off("event", handler)))
    return Stream.fromQueue(queue)
  })
}
