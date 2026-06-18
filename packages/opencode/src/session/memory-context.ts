import { Effect } from "effect"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { Project } from "@opencode-ai/core/project"
import { Token } from "@/util/token"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"

const DEFAULT_CAPS = {
  checkpoint: 11_000,
  memory: 10_000,
  notes: 6_000,
  global: 6_000,
}

function truncate(text: string, maxTokens: number) {
  const maxChars = maxTokens * 4
  if (Token.estimate(text) <= maxTokens) return text
  return `${text.slice(0, maxChars).trimEnd()}\n\n...[truncated for context cap]`
}

function section(title: string, path: string, body: string) {
  return [`## ${title}`, `Path: ${path}`, "", body.trim(), ""].join("\n")
}

export const system = Effect.fn("MemoryContext.system")(function* (input: { sessionID: string }) {
  const cfg = yield* Config.Service.pipe(Effect.flatMap((svc) => svc.get()))
  const caps = { ...DEFAULT_CAPS, ...cfg.checkpoint?.push_caps }
  const ctx = yield* InstanceState.context
  const projectID = Project.ID.make(MemoryPaths.projectIDFromPath(ctx.worktree))

  const entries = [
    { title: "Session checkpoint", path: MemoryPaths.checkpointPath(input.sessionID), cap: caps.checkpoint },
    { title: "Session notes", path: MemoryPaths.notesPath(input.sessionID), cap: caps.notes },
    { title: "Project memory", path: MemoryPaths.projectMemoryPath(projectID), cap: caps.memory },
    { title: "Global memory", path: MemoryPaths.globalMemoryPath(), cap: caps.global },
  ]

  const blocks: string[] = []
  for (const entry of entries) {
    const body = yield* Effect.tryPromise(() => Bun.file(entry.path).text()).pipe(Effect.catch(() => Effect.succeed("")))
    if (!body.trim()) continue
    blocks.push(section(entry.title, entry.path, truncate(body, entry.cap)))
  }

  if (blocks.length === 0) return ""
  return [`# Persistent memory context`, "", ...blocks].join("\n")
})

export * as MemoryContext from "./memory-context"
