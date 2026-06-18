import { Global } from "@opencode-ai/core/global"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { Project } from "@opencode-ai/core/project"
import path from "path"
import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Command, renderCheckpoint } from "@/command"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Command.defaultLayer, CrossSpawnSpawner.defaultLayer, testInstanceStoreLayer))

const sessionID = "ses_test_checkpoint"

test("renderCheckpoint injects session paths and template sections", () => {
  const dir = "/tmp/opencodex-checkpoint-test"
  const rendered = renderCheckpoint({ sessionID, worktree: dir })
  expect(rendered).toContain(MemoryPaths.checkpointPath(sessionID))
  expect(rendered).toContain(MemoryPaths.notesPath(sessionID))
  expect(rendered).toContain(
    MemoryPaths.projectMemoryPath(Project.ID.make(MemoryPaths.projectIDFromPath(dir))),
  )
  expect(rendered).toContain("§1 Active intent")
  expect(rendered).not.toContain("${checkpointPath}")
})

it.instance("registers checkpoint command as subtask", () =>
  provideTmpdirInstance(() =>
    Effect.gen(function* () {
      const commands = yield* Command.Service
      const checkpoint = yield* commands.get(Command.Default.CHECKPOINT)

      expect(checkpoint).toBeDefined()
      expect(checkpoint?.subtask).toBe(true)
      expect(checkpoint?.description).toContain("checkpoint.md")
    }),
  ),
)
