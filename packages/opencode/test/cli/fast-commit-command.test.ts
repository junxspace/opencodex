import { $ } from "bun"
import path from "path"
import { describe, expect, test } from "bun:test"
import { briefLockMessage, partitionLockFiles } from "@/commit-message/lock"
import { handleFastCommit, parseStatus, preview, selectedFiles } from "../../src/cli/cmd/fast-commit"
import { Style } from "../../src/cli/ui"
import { tmpdir } from "../fixture/fixture"

const style = Style

describe("fast-commit", () => {
  test("selectedFiles includes staged, unstaged, and untracked by default", () => {
    const status = parseStatus("M  staged.ts\n M unstaged.ts\n?? new.ts\n")
    expect(selectedFiles(status)).toEqual(["staged.ts", "unstaged.ts", "new.ts"])
    expect(selectedFiles(status, true)).toEqual(["staged.ts"])
  })

  test("parseStatus normalizes porcelain rename paths to the destination file", () => {
    const status = parseStatus("R  aether-mse-web/app/apple-icon.png -> aether-mse-server/src/main/resources/static/apple-icon.png\n")
    expect(status.staged).toEqual(["aether-mse-server/src/main/resources/static/apple-icon.png"])
    expect(status.related).toEqual(["aether-mse-web/app/apple-icon.png"])
    expect(status.renames).toEqual({
      "aether-mse-server/src/main/resources/static/apple-icon.png": [
        "aether-mse-web/app/apple-icon.png",
        "aether-mse-server/src/main/resources/static/apple-icon.png",
      ],
    })
    expect(selectedFiles(status)).toEqual([
      "aether-mse-server/src/main/resources/static/apple-icon.png",
      "aether-mse-web/app/apple-icon.png",
    ])
  })

  test("commits staged renames without passing the porcelain arrow path to git add", async () => {
    const calls: string[] = []
    await handleFastCommit({
      dir: "/repo",
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") {
          return {
            code: 0,
            stdout: "R  old/icon.png -> new/icon.png\n",
            stderr: "",
          }
        }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      analyze: async () => ({
        intents: [{ files: ["new/icon.png"], description: "move icon" }],
      }),
      generate: async () => ({ message: "refactor: 移动 icon" }),
      output: () => {},
      error: () => {},
      exit: () => {},
      style,
    })

    expect(calls).toContain("add old/icon.png new/icon.png")
    expect(calls.some((call) => call.includes("->"))).toBe(false)
    expect(calls).toContain("commit -m refactor: 移动 icon")
  })

  test("commits staged renames in a real git repo", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "old/icon.png"), "icon\n")
    await $`git add old/icon.png`.cwd(tmp.path).quiet()
    await $`git commit -m init`.cwd(tmp.path).quiet()
    await $`mkdir -p new`.cwd(tmp.path).quiet()
    await $`git mv old/icon.png new/icon.png`.cwd(tmp.path).quiet()

    const calls: string[] = []
    await handleFastCommit({
      dir: tmp.path,
      generate: async () => ({ message: "refactor: 移动 icon" }),
      analyze: async (input) => ({
        intents: [{ files: input.selectedFiles, description: "move icon" }],
      }),
      git: (args, cwd) => {
        calls.push(args.join(" "))
        const result = Bun.spawnSync(["git", ...args], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
          windowsHide: true,
        })
        return {
          code: result.exitCode,
          stdout: result.stdout.toString(),
          stderr: result.stderr.toString(),
        }
      },
      output: () => {},
      error: () => {},
      exit: () => {},
      style,
    })

    expect(calls.some((call) => call.includes("->"))).toBe(false)
    expect(calls).toContain("add old/icon.png new/icon.png")
    const status = await $`git status --porcelain`.cwd(tmp.path).quiet().text()
    expect(status.trim()).toBe("")
  })

  test("briefLockMessage formats single and multiple lock files", () => {
    expect(briefLockMessage(["bun.lock"])).toBe("chore(deps): 更新 bun.lock")
    expect(briefLockMessage(["bun.lock", "pnpm-lock.yaml"])).toBe("chore(deps): 更新依赖锁文件")
    expect(briefLockMessage(["bun.lock"], "chore: 修改 {file}")).toBe("chore: 修改 bun.lock")
  })

  test("partitionLockFiles separates lock files", () => {
    expect(partitionLockFiles(["src/a.ts", "bun.lock"])).toEqual({
      locks: ["bun.lock"],
      nonLocks: ["src/a.ts"],
    })
  })

  test("preview lists commit message and files", () => {
    const text = preview("feat(tui): 修复滚动", { files: ["src/a.ts"], description: "fix scroll" })
    expect(text).toContain("feat(tui): 修复滚动")
    expect(text).toContain("src/a.ts")
  })

  test("reports no changes when worktree is clean", async () => {
    const messages: string[] = []
    await handleFastCommit({
      dir: "/repo",
      git: (args) => {
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: (text) => messages.push(text),
      error: () => {},
      exit: () => {},
      style,
    })

    expect(messages.some((line) => line.includes("没有可提交的变更"))).toBe(true)
  })

  test("commits lock-only changes with brief message", async () => {
    const calls: string[] = []
    await handleFastCommit({
      dir: "/repo",
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: " M bun.lock\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      analyze: async () => ({
        intents: [{ files: ["bun.lock"], description: "update lock", message: "chore(deps): 更新 bun.lock" }],
      }),
      output: () => {},
      error: () => {},
      exit: () => {},
      style,
    })

    expect(calls).toContain("add bun.lock")
    expect(calls).toContain("commit -m chore(deps): 更新 bun.lock")
  })

  test("splits multiple intents into separate commits", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "src/api.ts"), "export function api() {}\n")
    await Bun.write(path.join(tmp.path, "docs/readme.md"), "# API docs\n")

    const calls: string[] = []
    const commits: string[] = []
    await handleFastCommit({
      dir: tmp.path,
      generate: async (input) => ({ message: input.intent?.description ?? "update" }),
      analyze: async () => ({
        intents: [
          { files: ["src/api.ts"], description: "feat: 添加 api" },
          { files: ["docs/readme.md"], description: "docs: 更新 readme" },
        ],
      }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") {
          return { code: 0, stdout: "?? src/api.ts\n?? docs/readme.md\n", stderr: "" }
        }
        if (args[0] === "commit") commits.push(args.at(-1) ?? "")
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
      error: () => {},
      exit: () => {},
      style,
    })

    expect(calls).toContain("add src/api.ts")
    expect(calls).toContain("commit -m feat: 添加 api")
    expect(calls).toContain("add docs/readme.md")
    expect(calls).toContain("commit -m docs: 更新 readme")
    expect(commits).toEqual(["feat: 添加 api", "docs: 更新 readme"])
  })

  test("generates intent messages in parallel", async () => {
    const starts: number[] = []
    const peak = { value: 0 }
    let active = 0
    const generate = async (input: { intent?: { files: string[] } }) => {
      active += 1
      peak.value = Math.max(peak.value, active)
      starts.push(Date.now())
      await new Promise((r) => setTimeout(r, 20))
      active -= 1
      return { message: input.intent?.files[0] ? `msg: ${input.intent.files[0]}` : "msg" }
    }

    await handleFastCommit({
      dir: "/repo",
      generate,
      analyze: async () => ({
        intents: [
          { files: ["src/a.ts"], description: "a" },
          { files: ["src/b.ts"], description: "b" },
          { files: ["src/c.ts"], description: "c" },
        ],
      }),
      git: (args) => {
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "?? src/a.ts\n?? src/b.ts\n?? src/c.ts\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
      error: () => {},
      exit: () => {},
      style,
    })

    expect(peak.value).toBe(3)
  })

  test("suggests push after commits without push flag", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "init"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    const messages: string[] = []

    const result = await handleFastCommit({
      dir: tmp.path,
      generate: async () => ({ message: "fix: 更新文件" }),
      analyze: async () => ({ intents: [{ files: ["file.txt"], description: "fix file" }] }),
      git: (args) => {
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: " M file.txt\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: (text) => messages.push(text),
      error: () => {},
      exit: () => {},
      style,
    })

    expect(result.commitCount).toBe(1)
    expect(result.pushed).toBe(false)
    expect(result.pushFailed).toBe(false)
    expect(messages.some((line) => line.includes("git push"))).toBe(true)
    expect(messages.some((line) => line.includes("fast-commit-and-push"))).toBe(true)
  })

  test("fast-commit-and-push pushes after commits", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "init"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    const calls: string[] = []

    await handleFastCommit({
      dir: tmp.path,
      push: true,
      generate: async () => ({ message: "fix: 更新文件" }),
      analyze: async () => ({ intents: [{ files: ["file.txt"], description: "fix file" }] }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: " M file.txt\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        if (args[0] === "push") return { code: 0, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
      error: () => {},
      exit: () => {},
      style,
    })

    expect(calls).toContain("commit -m fix: 更新文件")
    expect(calls.at(-1)).toBe("push")
  })

  test("fast-commit-and-push reports push failure after commits", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "init"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    const messages: string[] = []
    const errors: string[] = []

    const result = await handleFastCommit({
      dir: tmp.path,
      push: true,
      generate: async () => ({ message: "fix: 更新文件" }),
      analyze: async () => ({ intents: [{ files: ["file.txt"], description: "fix file" }] }),
      git: (args) => {
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: " M file.txt\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        if (args[0] === "push") return { code: 2, stdout: "", stderr: "husky - pre-push script failed\nerror: typecheck failed" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: (text) => messages.push(text),
      error: (text) => errors.push(text),
      exit: () => {},
      style,
    })

    expect(result.commitCount).toBe(1)
    expect(result.pushed).toBe(false)
    expect(result.pushFailed).toBe(true)
    expect(errors.join("\n")).toContain("pre-push script failed")
    expect(messages.some((line) => line.includes("Push failed"))).toBe(true)
    expect(messages.some((line) => line.includes("fast-commit-and-push"))).toBe(false)
  })

  test("push is skipped when there are no commits", async () => {
    const calls: string[] = []
    await handleFastCommit({
      dir: "/repo",
      push: true,
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
      error: () => {},
      exit: () => {},
      style,
    })

    expect(calls).not.toContain("push")
  })
})
