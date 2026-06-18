import { Global } from "@opencode-ai/core/global"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { Project } from "@opencode-ai/core/project"
import path from "path"
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Command, renderRemember } from "@/command"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Command.defaultLayer, CrossSpawnSpawner.defaultLayer, testInstanceStoreLayer))

const sessionID = "ses_test_remember"

it.instance("registers remember command with usage hints", () =>
  provideTmpdirInstance((dir) =>
    Effect.gen(function* () {
      const commands = yield* Command.Service
      const remember = yield* commands.get(Command.Default.REMEMBER)

      expect(remember).toBeDefined()
      expect(remember?.description).toContain("MEMORY.md")
      expect(remember?.subtask).toBe(true)
      expect(remember?.hints).toContain("$ARGUMENTS")

      const rendered = renderRemember({ sessionID, worktree: dir })
      expect(rendered).toContain(path.join(Global.Path.data, "memory"))
      expect(rendered).toContain(
        MemoryPaths.projectMemoryPath(Project.ID.make(MemoryPaths.projectIDFromPath(dir))),
      )
      expect(rendered).toContain(MemoryPaths.notesPath(sessionID))
      expect(rendered).toContain("--session")
      expect(rendered).toContain("--global")
      expect(rendered).not.toContain("${projectMemoryPath}")
    }),
  ),
)
