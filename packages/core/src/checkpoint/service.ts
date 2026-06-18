import path from "path"
import fs from "fs/promises"
import { Effect, Context, Layer } from "effect"
import { Memory } from "../memory"
import { Project } from "../project"
import * as Paths from "./paths"
import { TEMPLATE, MEMORY_TEMPLATE, MAX_LINES, MAX_SIZE } from "./templates"

export interface CheckpointData {
  sessionID: string
  projectID?: Project.ID
  content: string
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Checkpoint") {}

export interface Interface {
  write: (data: CheckpointData) => Effect.Effect<void, unknown>
  read: (sessionID: string) => Effect.Effect<string | undefined, unknown>
  writeMemory: (projectID: Project.ID, content: string) => Effect.Effect<void, unknown>
  readMemory: (projectID: Project.ID) => Effect.Effect<string | undefined, unknown>
  ensureDir: (sessionID: string) => Effect.Effect<void, unknown>
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memory = yield* Memory.Service

    const ensureDir = Effect.fn("Checkpoint.ensureDir")(function* (sessionID: string) {
      const dir = Paths.checkpointDir(sessionID)
      yield* Effect.tryPromise(() => fs.mkdir(dir, { recursive: true }))
    })

    const write = Effect.fn("Checkpoint.write")(function* (data: CheckpointData) {
      yield* ensureDir(data.sessionID)
      const filePath = Paths.checkpointPath(data.sessionID)
      yield* Effect.tryPromise(() => fs.writeFile(filePath, data.content, "utf-8"))
      yield* memory.index({
        path: filePath,
        scope: "sessions",
        scopeId: data.sessionID,
        type: "checkpoint",
        body: data.content,
        fingerprint: `${data.content.length}-${Date.now()}`,
      })
    })

    const read = Effect.fn("Checkpoint.read")(function* (sessionID: string) {
      const filePath = Paths.checkpointPath(sessionID)
      const exists = yield* Effect.tryPromise(() =>
        fs
          .access(filePath)
          .then(() => true)
          .catch(() => false),
      )
      if (!exists) return undefined
      return yield* Effect.tryPromise(() => fs.readFile(filePath, "utf-8"))
    })

    const writeMemory = Effect.fn("Checkpoint.writeMemory")(function* (projectID: Project.ID, content: string) {
      const filePath = Paths.projectMemoryPath(projectID)
      yield* Effect.tryPromise(() => fs.mkdir(path.dirname(filePath), { recursive: true }))
      
      const trimmed = trimContent(content)
      yield* Effect.tryPromise(() => fs.writeFile(filePath, trimmed, "utf-8"))
      yield* memory.index({
        path: filePath,
        scope: "projects",
        scopeId: projectID,
        type: "memory",
        body: trimmed,
        fingerprint: `${trimmed.length}-${Date.now()}`,
      })
    })

    const readMemory = Effect.fn("Checkpoint.readMemory")(function* (projectID: Project.ID) {
      const filePath = Paths.projectMemoryPath(projectID)
      const exists = yield* Effect.tryPromise(() =>
        fs
          .access(filePath)
          .then(() => true)
          .catch(() => false),
      )
      if (!exists) {
        return MEMORY_TEMPLATE
      }
      return yield* Effect.tryPromise(() => fs.readFile(filePath, "utf-8"))
    })

    return Service.of({ write, read, writeMemory, readMemory, ensureDir })
  }),
)

function trimContent(content: string): string {
  const lines = content.split("\n")
  if (lines.length <= MAX_LINES && content.length <= MAX_SIZE) {
    return content
  }
  const trimmedLines = lines.slice(0, MAX_LINES)
  let result = trimmedLines.join("\n")
  if (result.length > MAX_SIZE) {
    result = result.slice(0, MAX_SIZE)
  }
  return result + "\n\n[Content trimmed to fit limits]"
}

export const defaultLayer = layer.pipe(Layer.provide(Memory.defaultLayer))
