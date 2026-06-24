import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test"
import type { GitContext } from "@/commit-message/types"
import type { Provider } from "@/provider/provider"
import type { InstanceContext } from "@/project/instance-context"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"

const realLog = await import("@opencode-ai/core/util/log")

let mockStreamText = "feat(src): add hello world logging"

const defaultGitContext: GitContext = {
  branch: "main",
  recentCommits: ["abc1234 initial commit"],
  files: [
    {
      status: "modified",
      path: "src/index.ts",
      diff: "+console.log('hello')",
    },
  ],
}

let mockGitContext: GitContext = { ...defaultGitContext }
let captured: { path: string; selected?: string[] } = { path: "" }
let input: unknown

mock.module("@opencode-ai/core/util/log", () => ({
  ...realLog,
  create: () => ({
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  }),
}))

import { CommitMessageRuntime, generateCommitMessage } from "../../src/commit-message/generate"

const context = spyOn(CommitMessageRuntime, "context").mockImplementation(async (repoPath, selectedFiles) => {
  captured = { path: repoPath, selected: selectedFiles }
  return mockGitContext
})
const stream = spyOn(CommitMessageRuntime, "generate").mockImplementation(async (value) => {
  input = value
  return mockStreamText
})
const model = spyOn(CommitMessageRuntime, "model").mockImplementation(
  async (ref) =>
    ref
      ? ({ providerID: ref.split("/")[0], id: ref.split("/").slice(1).join("/") }) as Provider.Model
      : ({ providerID: "test", id: "test-small-model" }) as Provider.Model,
)

describe("commit-message.generate", () => {
  beforeEach(() => {
    context.mockImplementation(async (repoPath, selectedFiles) => {
      captured = { path: repoPath, selected: selectedFiles }
      return mockGitContext
    })
    stream.mockImplementation(async (value) => {
      input = value
      return mockStreamText
    })
    model.mockImplementation(
      async (ref) =>
        ref
          ? ({
              providerID: ProviderV2.ID.make(ref.split("/")[0]),
              id: ModelV2.ID.make(ref.split("/").slice(1).join("/")),
            }) as Provider.Model
          : ({
              providerID: ProviderV2.ID.make("test"),
              id: ModelV2.ID.make("test-small-model"),
            }) as Provider.Model,
    )
    mockStreamText = "feat(src): add hello world logging"
    mockGitContext = { ...defaultGitContext }
    captured = { path: "" }
    input = undefined
  })

  describe("prompt construction", () => {
    test("passes path to getGitContext", async () => {
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBeTruthy()
      expect(captured.path).toBe("/repo")
    })

    test("generates message from git context with multiple files", async () => {
      mockStreamText = "feat(api): add api module"
      mockGitContext = {
        branch: "main",
        recentCommits: ["abc1234 initial commit"],
        files: [
          { status: "added", path: "src/api.ts", diff: "+export function api() {}" },
          { status: "modified", path: "src/index.ts", diff: "+import { api } from './api'" },
        ],
      }
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("feat(api): add api module")
    })
  })

  describe("response cleaning", () => {
    test("strips code block markers from response", async () => {
      mockStreamText = "```\nfeat: add feature\n```"
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("feat: add feature")
    })

    test("strips code block markers with language tag", async () => {
      mockStreamText = "```text\nfix(auth): resolve token refresh\n```"
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("fix(auth): resolve token refresh")
    })

    test("strips surrounding double quotes", async () => {
      mockStreamText = '"feat: add new feature"'
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("feat: add new feature")
    })

    test("strips surrounding single quotes", async () => {
      mockStreamText = "'fix: resolve bug'"
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("fix: resolve bug")
    })

    test("strips whitespace around the message", async () => {
      mockStreamText = "  \n  chore: update deps  \n  "
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("chore: update deps")
    })

    test("strips code blocks AND quotes together", async () => {
      mockStreamText = '```\n"refactor: simplify logic"\n```'
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("refactor: simplify logic")
    })

    test("returns clean message when no markers present", async () => {
      mockStreamText = "docs: update readme"
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBe("docs: update readme")
    })
  })

  describe("error on no changes", () => {
    test("throws when no git changes are found", async () => {
      mockGitContext = { branch: "main", recentCommits: [], files: [] }
      await expect(generateCommitMessage({ path: "/repo" })).rejects.toThrow(
        "No changes found to generate a commit message for",
      )
    })
  })

  describe("selectedFiles pass-through", () => {
    test("passes selectedFiles to getGitContext", async () => {
      const result = await generateCommitMessage({
        path: "/repo",
        selectedFiles: ["src/a.ts"],
      })
      expect(result.message).toBeTruthy()
      expect(captured.path).toBe("/repo")
      expect(captured.selected).toEqual(["src/a.ts"])
    })
  })

  describe("custom prompt", () => {
    test("uses default prompt when no custom prompt provided", async () => {
      const result = await generateCommitMessage({ path: "/repo" })
      expect(result.message).toBeTruthy()
    })

    test("uses custom prompt when provided", async () => {
      const result = await generateCommitMessage({ path: "/repo", prompt: "Write a haiku commit message." })
      expect(result.message).toBeTruthy()
    })
  })

  describe("generation retries", () => {
    test("retries transient SSE read timeouts", async () => {
      let attempts = 0
      stream.mockImplementation(async () => {
        attempts++
        if (attempts < 2) throw new Error("SSE read timed out")
        return mockStreamText
      })

      const result = await generateCommitMessage({ path: "/repo" })

      expect(result.message).toBe("feat(src): add hello world logging")
      expect(attempts).toBe(2)
    })
  })

  describe("custom model", () => {
    test("uses configured model when provided", async () => {
      const result = await generateCommitMessage({ path: "/repo", model: "custom/model-id" })
      const value = input as { model: Provider.Model; user: { model: { providerID: string; modelID: string } } }

      expect(result.message).toBeTruthy()
      expect(String(value.model.providerID)).toBe("custom")
      expect(String(value.model.id)).toBe("model-id")
      expect(value.user.model).toEqual({ providerID: "custom", modelID: "model-id" })
    })

    test("passes instance context to model and stream runtime", async () => {
      const calls: unknown[] = []
      model.mockImplementation(async (_ref, instance) => {
        calls.push(instance)
        return {
          providerID: ProviderV2.ID.make("test"),
          id: ModelV2.ID.make("test-small-model"),
        } as Provider.Model
      })
      stream.mockImplementation(async (_value, _signal, instance) => {
        calls.push(instance)
        return mockStreamText
      })
      const instance = { directory: "/repo", worktree: "/repo", project: { id: "test" } } as InstanceContext

      await generateCommitMessage({ path: "/repo", instance })

      expect(calls).toEqual([instance, instance])
    })
  })
})
