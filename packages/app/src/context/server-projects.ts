import type { Project } from "@opencode-ai/sdk/v2/client"
import { batch } from "solid-js"
import { pathKey } from "@/utils/path-key"
import type { createServerProjects } from "./server"

export function visibleServerProjects(projects: Project[]) {
  return projects.filter(
    (project) =>
      !!project?.id &&
      project.id !== "global" &&
      !!project.worktree &&
      project.worktree !== "/" &&
      !project.worktree.includes("opencode-test"),
  )
}

export function mergedProjectEntries(input: {
  projects: ReturnType<typeof createServerProjects>
  serverProjects: Project[]
}) {
  const dismissed = new Set(input.projects.dismissed().map(pathKey))
  const visible = visibleServerProjects(input.serverProjects)
  const local = input.projects.list().filter((project) => !dismissed.has(pathKey(project.worktree)))
  const localKeys = new Set(local.map((project) => pathKey(project.worktree)))
  const allServerDismissed =
    local.length === 0 &&
    visible.length > 0 &&
    visible.every((project) => dismissed.has(pathKey(project.worktree)))
  const activeDismissed = allServerDismissed ? new Set<string>() : dismissed

  const serverOnly = visible
    .filter((project) => !activeDismissed.has(pathKey(project.worktree)) && !localKeys.has(pathKey(project.worktree)))
    .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    .map((project) => ({ worktree: project.worktree, expanded: true }))

  return [...local, ...serverOnly]
}

export function syncAdoptedServerProjects(input: {
  projects: ReturnType<typeof createServerProjects>
  serverProjects: Project[]
}) {
  const sorted = mergedProjectEntries(input).slice().reverse()

  batch(() => {
    for (const project of sorted) {
      input.projects.open(project.worktree)
    }
  })
}
