import path from "path"
import { Global } from "../global"
import { Project } from "../project"

export function checkpointDir(sessionID: string) {
  return path.join(root(), "sessions", sessionID)
}

export function checkpointPath(sessionID: string) {
  return path.join(checkpointDir(sessionID), "checkpoint.md")
}

export function checkpointOverflowPath(sessionID: string, topic: string) {
  return path.join(checkpointDir(sessionID), `checkpoint-${topic}.md`)
}

export function notesPath(sessionID: string) {
  return path.join(checkpointDir(sessionID), "notes.md")
}

export function progressPath(sessionID: string, taskID: string) {
  return path.join(checkpointDir(sessionID), "tasks", taskID, "progress.md")
}

export function projectMemoryPath(projectID: Project.ID) {
  return path.join(root(), "projects", projectID, "MEMORY.md")
}

export function globalMemoryPath() {
  return path.join(root(), "global", "MEMORY.md")
}

export function root() {
  return path.join(Global.Path.data, "memory")
}
