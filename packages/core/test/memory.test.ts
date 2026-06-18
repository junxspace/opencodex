import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Memory } from "@opencode-ai/core/memory"
import { Database } from "@opencode-ai/core/database/database"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import memoryFtsMigration from "@opencode-ai/core/database/migration/20260617000000_memory_fts"
import * as SearchConfig from "@opencode-ai/core/memory/search-config"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:")
const memory = Memory.layer.pipe(Layer.provide(database))
const it = testEffect(Layer.mergeAll(database, memory))

const withMemoryFts = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* DatabaseMigration.applyOnly(db, [memoryFtsMigration])
})

describe("Memory Service", () => {
  it.effect("should search memory with BM25", () =>
    Effect.gen(function* () {
      yield* withMemoryFts
      const svc = yield* Memory.Service
      const results = yield* svc.search({ query: "authentication", limit: 10 })
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    }),
  )

  it.effect("should filter by scope", () =>
    Effect.gen(function* () {
      yield* withMemoryFts
      const svc = yield* Memory.Service
      const results = yield* svc.search({
        query: "test",
        scope: "projects",
        limit: 5,
      })
      expect(results).toBeDefined()
    }),
  )

  it.effect("should index and retrieve memory", () =>
    Effect.gen(function* () {
      yield* withMemoryFts
      const svc = yield* Memory.Service
      const entry = {
        path: "/test/memory.md",
        scope: "projects" as const,
        scopeId: "test-project",
        type: "memory" as const,
        body: "This is test content for memory indexing",
        fingerprint: "100-1234567890",
      }

      yield* svc.index(entry)
      const results = yield* svc.search({ query: "test content", limit: 5 })
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0]?.path).toBe(entry.path)
    }),
  )

  it.effect("should remove indexed memory", () =>
    Effect.gen(function* () {
      yield* withMemoryFts
      const svc = yield* Memory.Service
      const testPath = "/test/remove-memory.md"
      const entry = {
        path: testPath,
        scope: "sessions" as const,
        scopeId: "test-session",
        type: "notes" as const,
        body: "Content to remove",
        fingerprint: "50-1234567890",
      }

      yield* svc.index(entry)
      yield* svc.remove(testPath)
      const result = yield* svc.get(testPath)
      expect(result).toBeUndefined()
    }),
  )

  it.effect("applies configurable score floor ratio", () =>
    Effect.gen(function* () {
      yield* withMemoryFts
      const svc = yield* Memory.Service

      yield* svc.index({
        path: "/test/alpha.md",
        scope: "projects",
        scopeId: "proj",
        type: "memory",
        body: "authentication authentication authentication login session",
        fingerprint: "1",
      })
      yield* svc.index({
        path: "/test/beta.md",
        scope: "projects",
        scopeId: "proj",
        type: "memory",
        body: "brief authentication mention",
        fingerprint: "2",
      })

      SearchConfig.apply({ score_floor: 0.99 })
      const strict = yield* svc.search({ query: "authentication", limit: 10 })
      SearchConfig.apply({ score_floor: 0.01 })
      const loose = yield* svc.search({ query: "authentication", limit: 10 })

      expect(loose.length).toBeGreaterThanOrEqual(2)
      expect(strict.length).toBe(1)
    }),
  )
})
