import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createServerProjects } from "./server"
import { mergedProjectEntries, syncAdoptedServerProjects } from "./server-projects"
import { ServerScope } from "@/utils/server-scope"

describe("mergedProjectEntries", () => {
  test("includes server projects without local entries", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, dismissed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      const entries = mergedProjectEntries({
        projects,
        serverProjects: [
          { id: "a", worktree: "/a", sandboxes: [], time: { created: 1, updated: 2 } },
          { id: "b", worktree: "/b", sandboxes: [], time: { created: 1, updated: 3 } },
        ],
      })

      expect(entries.map((project) => project.worktree)).toEqual(["/b", "/a"])
      dispose()
    })
  })

  test("recovers when every server project was dismissed and local list is empty", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, dismissed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      projects.close("/a")
      projects.close("/b")

      const entries = mergedProjectEntries({
        projects,
        serverProjects: [
          { id: "a", worktree: "/a", sandboxes: [], time: { created: 1, updated: 1 } },
          { id: "b", worktree: "/b", sandboxes: [], time: { created: 2, updated: 2 } },
        ],
      })

      expect(entries.map((project) => project.worktree)).toEqual(["/b", "/a"])
      dispose()
    })
  })
})

describe("syncAdoptedServerProjects", () => {
  test("adopts server projects into the local list", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, dismissed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      syncAdoptedServerProjects({
        projects,
        serverProjects: [
          {
            id: "older",
            worktree: "/older",
            sandboxes: [],
            time: { created: 1, updated: 1 },
          },
          {
            id: "newer",
            worktree: "/newer",
            sandboxes: [],
            time: { created: 2, updated: 3 },
          },
        ],
      })

      expect(projects.list().map((project) => project.worktree)).toEqual(["/newer", "/older"])
      dispose()
    })
  })

  test("skips dismissed projects", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, dismissed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      projects.close("/hidden")

      syncAdoptedServerProjects({
        projects,
        serverProjects: [
          { id: "visible", worktree: "/visible", sandboxes: [], time: { created: 1, updated: 1 } },
          { id: "hidden", worktree: "/hidden", sandboxes: [], time: { created: 2, updated: 2 } },
        ],
      })

      expect(projects.list().map((project) => project.worktree)).toEqual(["/visible"])
      dispose()
    })
  })
})
