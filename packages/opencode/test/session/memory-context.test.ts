import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { MemoryContext } from "@/session/memory-context"
import { Config } from "@/config/config"
import { InstanceRef } from "@/effect/instance-ref"
import { testEffect } from "../lib/effect"

const worktree = "/tmp/memory-context-test"
const instance = {
  directory: worktree,
  worktree,
  project: { id: "proj_test" as never, worktree, vcs: "git" as const, time: {}, sandboxes: [] },
} as const

const emptyConfigLayer = Layer.succeed(
  Config.Service,
  Config.Service.of({
    get: () => Effect.succeed({}),
    getGlobal: () => Effect.succeed({}),
    getConsoleState: () =>
      Effect.succeed({ consoleManagedProviders: [], activeOrgName: undefined, switchableOrgCount: 0 }),
    update: () => Effect.void,
    updateGlobal: () => Effect.succeed({ info: {}, changed: false }),
    invalidate: () => Effect.void,
    directories: () => Effect.succeed([]),
    waitForDependencies: () => Effect.void,
  }),
)

const it = testEffect(Layer.mergeAll(Layer.succeed(InstanceRef, instance as never), emptyConfigLayer))

describe("MemoryContext", () => {
  it.effect("injects existing memory files with push_caps truncation", () =>
    Effect.gen(function* () {
      const sessionID = "ses_context_test_" + Date.now()
      const notesPath = MemoryPaths.notesPath(sessionID)

      yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* Effect.tryPromise(() => Bun.write(notesPath, "# Session notes\n\n- remember to run tests\n"))

          const cfg = {
            checkpoint: {
              push_caps: {
                notes: 5,
              },
            },
          }
          const configLayer = Layer.succeed(
            Config.Service,
            Config.Service.of({
              get: () => Effect.succeed(cfg),
              getGlobal: () => Effect.succeed(cfg),
              getConsoleState: () =>
                Effect.succeed({ consoleManagedProviders: [], activeOrgName: undefined, switchableOrgCount: 0 }),
              update: () => Effect.void,
              updateGlobal: () => Effect.succeed({ info: cfg, changed: false }),
              invalidate: () => Effect.void,
              directories: () => Effect.succeed([]),
              waitForDependencies: () => Effect.void,
            }),
          )

          const text = yield* MemoryContext.system({ sessionID }).pipe(Effect.provide(configLayer))
          expect(text).toContain("# Persistent memory context")
          expect(text).toContain("Session notes")
          expect(text).toContain(notesPath)
          expect(text).toContain("truncated for context cap")
        }),
        Effect.tryPromise(() => fs.rm(path.dirname(notesPath), { recursive: true, force: true })),
      )
    }),
  )

  it.effect("returns empty string when no memory files exist", () =>
    Effect.gen(function* () {
      const text = yield* MemoryContext.system({ sessionID: "ses_empty_context" })
      expect(text).toBe("")
    }),
  )
})
