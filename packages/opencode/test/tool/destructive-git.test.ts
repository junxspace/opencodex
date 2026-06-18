import { describe, expect, test } from "bun:test"
import path from "path"
import { DestructiveGit } from "../../src/tool/shell/destructive-git"

const cwd = "/repo"
const touched = new Set([path.normalize("/repo/app/layout.tsx")])

describe("destructive git guard", () => {
  test("flags checkout on files outside the session", () => {
    const hit = DestructiveGit.destructiveGitCommand(
      ["git", "checkout", "--", "components/button.tsx"],
      touched,
      cwd,
    )
    expect(hit).toBe("git checkout -- components/button.tsx")
  })

  test("allows checkout on session-touched files only", () => {
    const hit = DestructiveGit.destructiveGitCommand(["git", "checkout", "--", "app/layout.tsx"], touched, cwd)
    expect(hit).toBeUndefined()
  })

  test("flags restore on files outside the session", () => {
    const hit = DestructiveGit.destructiveGitCommand(["git", "restore", "AGENTS.md"], touched, cwd)
    expect(hit).toBe("git restore AGENTS.md")
  })

  test("flags reset --hard", () => {
    const hit = DestructiveGit.destructiveGitCommand(["git", "reset", "--hard"], touched, cwd)
    expect(hit).toBe("git reset --hard")
  })

  test("ignores branch checkout without --", () => {
    const hit = DestructiveGit.destructiveGitCommand(["git", "checkout", "main"], touched, cwd)
    expect(hit).toBeUndefined()
  })

  test("flags checkout of .", () => {
    const hit = DestructiveGit.destructiveGitCommand(["git", "checkout", "--", "."], touched, cwd)
    expect(hit).toBe("git checkout -- .")
  })

  test("collects session patch files", () => {
    const files = DestructiveGit.sessionTouchedFiles([
      {
        info: { id: "msg_1", role: "assistant" } as any,
        parts: [
          {
            type: "patch",
            files: ["/repo/app/layout.tsx"],
          } as any,
        ],
      },
    ])
    expect(files.has(path.normalize("/repo/app/layout.tsx"))).toBe(true)
  })
})
