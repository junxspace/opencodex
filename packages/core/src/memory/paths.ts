import path from "path"
import crypto from "crypto"
import { Global } from "../global"
import { Project } from "../project"

export function root() {
  return path.join(Global.Path.data, "memory")
}

export function globalMemoryPath() {
  return path.join(root(), "global", "MEMORY.md")
}

export function projectMemoryDir(projectID: Project.ID) {
  return path.join(root(), "projects", projectID)
}

export function projectMemoryPath(projectID: Project.ID) {
  return path.join(projectMemoryDir(projectID), "MEMORY.md")
}

export function projectMemoryOverflowPath(projectID: Project.ID, topic: string) {
  return path.join(projectMemoryDir(projectID), `MEMORY-${topic}.md`)
}

export function sessionMemoryDir(sessionID: string) {
  return path.join(root(), "sessions", sessionID)
}

export function checkpointPath(sessionID: string) {
  return path.join(sessionMemoryDir(sessionID), "checkpoint.md")
}

export function checkpointOverflowPath(sessionID: string, topic: string) {
  return path.join(sessionMemoryDir(sessionID), `checkpoint-${topic}.md`)
}

export function notesPath(sessionID: string) {
  return path.join(sessionMemoryDir(sessionID), "notes.md")
}

export function progressDir(sessionID: string, taskID: string) {
  return path.join(sessionMemoryDir(sessionID), "tasks", taskID)
}

export function progressPath(sessionID: string, taskID: string) {
  return path.join(progressDir(sessionID, taskID), "progress.md")
}

export function projectIDFromPath(repoPath: string): string {
  return crypto.createHash("sha256").update(repoPath).digest("hex").slice(0, 12)
}

export function parsePath(filePath: string): { scope: string; scopeId: string; type: string } | null {
  const memoryRoot = root()
  if (!filePath.startsWith(memoryRoot)) return null

  const relative = path.relative(memoryRoot, filePath)
  const parts = relative.split(path.sep)

  if (parts.length < 2) return null

  const [scope, scopeIdOrFile] = parts

  if (scope === "global") {
    return { scope: "global", scopeId: "", type: "memory" }
  }

  if (scope === "projects") {
    if (parts.length < 3) return null
    const scopeId = scopeIdOrFile
    const fileName = parts[2]
    const type = fileName.startsWith("MEMORY") ? "memory" : "notes"
    return { scope: "projects", scopeId, type }
  }

  if (scope === "sessions") {
    if (parts.length < 3) return null
    const scopeId = scopeIdOrFile
    const fileName = parts[2]
    
    if (fileName.startsWith("checkpoint")) return { scope: "sessions", scopeId, type: "checkpoint" }
    if (fileName === "notes.md") return { scope: "sessions", scopeId, type: "notes" }
    if (parts.length >= 4 && parts[2] === "tasks") {
      return { scope: "sessions", scopeId, type: "progress" }
    }
  }

  return null
}
