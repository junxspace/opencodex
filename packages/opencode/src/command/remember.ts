import path from "path"
import { Global } from "@opencode-ai/core/global"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { Project } from "@opencode-ai/core/project"
import PROMPT_REMEMBER from "./template/remember.txt"
import PROMPT_REMEMBER_USAGE from "./template/remember-usage.txt"

export const USAGE = PROMPT_REMEMBER_USAGE

export function render(input: { sessionID: string; worktree: string }) {
  const memoryRoot = path.join(Global.Path.data, "memory")
  const projectMemoryID = Project.ID.make(MemoryPaths.projectIDFromPath(input.worktree))
  return PROMPT_REMEMBER.replaceAll("${memoryRoot}", memoryRoot)
    .replaceAll("${sessionID}", input.sessionID)
    .replaceAll("${projectMemoryID}", projectMemoryID)
    .replaceAll("${projectMemoryPath}", MemoryPaths.projectMemoryPath(projectMemoryID))
    .replaceAll("${sessionNotesPath}", MemoryPaths.notesPath(input.sessionID))
    .replaceAll("${globalMemoryPath}", MemoryPaths.globalMemoryPath())
}
