import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Checkpoint } from "@opencode-ai/core/checkpoint"
import { Memory } from "@opencode-ai/core/memory"
import { Database } from "@opencode-ai/core/database/database"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:")
const memory = Memory.layer.pipe(Layer.provide(database))
const checkpoint = Checkpoint.layer.pipe(Layer.provide(memory))
const it = testEffect(Layer.mergeAll(database, memory, checkpoint))

describe("Checkpoint Service", () => {
  it.effect("should write checkpoint", () =>
    Effect.gen(function* () {
      const sessionID = "test-session-" + Date.now()
      const content = "## §1 Active intent\nTest checkpoint content"
      
      const svc = yield* Checkpoint.Service
      yield* svc.write({ sessionID, content })
      const result = yield* svc.read(sessionID)
      
      expect(result).toBeDefined()
    }),
  )

  it.effect("should read non-existent checkpoint", () =>
    Effect.gen(function* () {
      const svc = yield* Checkpoint.Service
      const result = yield* svc.read("non-existent-session")
      expect(result).toBeUndefined()
    }),
  )

  it.effect("should write and read project memory", () =>
    Effect.gen(function* () {
      const projectID = "test-project-" + Date.now()
      const content = "## Project context\nTest project memory"
      
      const svc = yield* Checkpoint.Service
      yield* svc.writeMemory(projectID as any, content)
      const result = yield* svc.readMemory(projectID as any)
      
      expect(result).toBeDefined()
    }),
  )

  it.effect("should return default memory template for new project", () =>
    Effect.gen(function* () {
      const projectID = "new-project-" + Date.now()
      
      const svc = yield* Checkpoint.Service
      const result = yield* svc.readMemory(projectID as any)
      
      expect(result).toBeDefined()
    }),
  )
})