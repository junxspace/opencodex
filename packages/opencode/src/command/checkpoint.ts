import path from "path"
import { Global } from "@opencode-ai/core/global"
import { TEMPLATE } from "@opencode-ai/core/checkpoint/templates"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { Project } from "@opencode-ai/core/project"
import PROMPT_CHECKPOINT from "./template/checkpoint.txt"

export function render(input: { sessionID: string; worktree: string }) {
  const memoryRoot = path.join(Global.Path.data, "memory")
  const projectMemoryID = Project.ID.make(MemoryPaths.projectIDFromPath(input.worktree))
  return PROMPT_CHECKPOINT.replaceAll("${memoryRoot}", memoryRoot)
    .replaceAll("${sessionID}", input.sessionID)
    .replaceAll("${projectMemoryID}", projectMemoryID)
    .replaceAll("${checkpointPath}", MemoryPaths.checkpointPath(input.sessionID))
    .replaceAll("${sessionNotesPath}", MemoryPaths.notesPath(input.sessionID))
    .replaceAll("${projectMemoryPath}", MemoryPaths.projectMemoryPath(projectMemoryID))
    .replaceAll("${checkpointTemplate}", TEMPLATE)
}
