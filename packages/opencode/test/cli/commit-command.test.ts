import { $ } from "bun"
import path from "path"
import { describe, expect, test } from "bun:test"
import {
  handle,
  intentFiles,
  noCommittableMessage,
  parseStatus,
  preview,
  resolveStageOptions,
} from "../../src/cli/cmd/commit"
import { tmpdir } from "../fixture/fixture"

async function log(dir: string) {
  const result = await $`git log -1 --pretty=%B`.cwd(dir).quiet()
  return result.stdout.toString().trim()
}

async function tracked(dir: string) {
  const result = await $`git ls-files`.cwd(dir).quiet()
  return result.stdout.toString().trim().split("\n").filter(Boolean)
}

describe("commit command", () => {
  test("intentFiles requires staged changes unless --all or --include-untracked is set", () => {
    const status = parseStatus(" M bun.lock\n")
    expect(intentFiles(status, {})).toEqual([])
    expect(intentFiles(status, { all: true })).toEqual(["bun.lock"])
    expect(noCommittableMessage(status, {}, [])).toContain("No staged changes")
    expect(noCommittableMessage(status, { all: true }, ["bun.lock"])).toContain("Only lock file changes found")
  })

  test("resolveStageOptions enables --all when --yes or --push is set without staged changes", () => {
    const status = parseStatus(" M file.txt\n")
    expect(resolveStageOptions(status, { yes: true })).toEqual({ all: true, includeUntracked: false })
    expect(resolveStageOptions(status, { push: true })).toEqual({ all: true, includeUntracked: false })
    expect(resolveStageOptions(status, {})).toEqual({ all: false, includeUntracked: false })
    expect(resolveStageOptions(parseStatus("M  file.txt\n"), { yes: true })).toEqual({
      all: false,
      includeUntracked: false,
    })
  })

  test("commits unstaged changes with --yes --push", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "add file"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    const calls: string[] = []

    await handle({
      dir: tmp.path,
      yes: true,
      push: true,
      generate: async () => ({ message: "fix: update file" }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: " M file.txt\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        if (args[0] === "push") return { code: 0, stdout: "pushed\n", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
      error: () => {},
      exit: () => {},
    })

    expect(calls).toContain("add file.txt")
    expect(calls).toContain("commit -m fix: update file")
    expect(calls.at(-1)).toBe("push")
  })

  test("rejects unstaged changes without --all", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "add file"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    const errors: string[] = []

    await handle({
      dir: tmp.path,
      generate: async () => ({ message: "fix: update file" }),
      output: () => {},
      error: (text) => errors.push(text),
      exit: () => {},
    })

    expect(errors).toEqual(["No staged changes. Stage files with git add or pass --all to include unstaged changes."])
  })

  test("preview truncates long file lists and omits wide git add line", () => {
    const files = Array.from({ length: 20 }, (_, i) => `packages/foo/file-${i}.ts`)
    const text = preview("feat: add feature", { files, description: "add feature" })

    expect(text).toContain("feat: add feature")
    expect(text).toContain("... and 5 more")
    expect(text).not.toContain("git add")
    expect(text.split("\n").every((line) => line.length < 120)).toBe(true)
  })

  test("parseStatus separates staged, unstaged, and untracked files", () => {
    const status = parseStatus("M  staged.ts\n M unstaged.ts\nA  added.ts\n?? new.ts\nMM both.ts\n")
    expect(status.staged).toEqual(["staged.ts", "added.ts", "both.ts"])
    expect(status.unstaged).toEqual(["unstaged.ts", "both.ts"])
    expect(status.untracked).toEqual(["new.ts"])
  })

  test("commits staged changes with a generated message after confirmation", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\n")
    await $`git add file.txt`.cwd(tmp.path).quiet()

    const out: string[] = []
    await handle({
      dir: tmp.path,
      generate: async () => ({ message: "feat: add file" }),
      selectAction: async () => "commit",
      output: (text) => out.push(text),
    })

    expect(await log(tmp.path)).toBe("feat: add file")
    const text = out.join("\n")
    expect(text).toContain("Staged changes")
    expect(text).toContain("file.txt")
  })

  test("auto-stages related tracked changes with --all", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "add file"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    const errors: string[] = []

    await handle({
      dir: tmp.path,
      all: true,
      generate: async () => ({ message: "fix: update file" }),
      selectAction: async () => "commit",
      output: () => {},
      error: (text) => errors.push(text),
      exit: () => {},
    })

    expect(await log(tmp.path)).toBe("fix: update file")
    expect(errors).toEqual([])
  })

  test("includes untracked files when analyzer groups them with tracked changes", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "add file"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    await Bun.write(path.join(tmp.path, "new.txt"), "secret\n")

    await handle({
      dir: tmp.path,
      all: true,
      generate: async () => ({ message: "fix: update tracked file" }),
      selectAction: async () => "commit",
      output: () => {},
    })

    expect(await tracked(tmp.path)).toContain("new.txt")
  })

  test("dry run does not stage tracked changes", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file.txt"), "hello\n")
        await $`git add file.txt`.cwd(dir).quiet()
        await $`git commit -m "add file"`.cwd(dir).quiet()
      },
    })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\nworld\n")
    const errors: string[] = []

    await handle({
      dir: tmp.path,
      all: true,
      dryRun: true,
      generate: async () => ({ message: "fix: update file" }),
      output: () => {},
      error: (text) => errors.push(text),
      exit: () => {},
    })

    const status = await $`git status --porcelain`.cwd(tmp.path).quiet()
    expect(status.stdout.toString()).toBe(" M file.txt\n")
    expect(errors).toEqual([])
  })

  test("auto-stages untracked files with --include-untracked", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "new.txt"), "hello\n")
    const errors: string[] = []

    await handle({
      dir: tmp.path,
      includeUntracked: true,
      generate: async () => ({ message: "feat: add new file" }),
      selectAction: async () => "commit",
      output: () => {},
      error: (text) => errors.push(text),
      exit: () => {},
    })

    expect(await tracked(tmp.path)).toContain("new.txt")
    expect(errors).toEqual([])
  })

  test("CLI command loads project context before reading config", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\n")

    const result = await $`bun run --conditions=browser src/index.ts commit --dir ${tmp.path} --dry-run --include-untracked --message test`
      .cwd(path.join(import.meta.dir, "../.."))
      .quiet()
      .nothrow()
    const text = result.stdout.toString() + result.stderr.toString()

    expect(result.exitCode).toBe(0)
    expect(text).toContain("Dry run: commit not created")
    expect(text).not.toContain("No context found for instance")
    expect(text).not.toContain("service=commit-message")
  })

  test("CLI command uses original wrapper cwd by default", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "from-orig.txt"), "hello\n")

    const result = await $`bun run --conditions=browser src/index.ts commit --dry-run --include-untracked --message test`
      .cwd(path.join(import.meta.dir, "../.."))
      .env({ ...process.env, OPENCODE_ORIG_CWD: tmp.path })
      .quiet()
      .nothrow()
    const text = result.stdout.toString() + result.stderr.toString()

    expect(result.exitCode).toBe(0)
    expect(text).toContain("from-orig.txt")
    expect(text).toContain("Dry run: commit not created")
    expect(text).not.toContain("No context found for instance")
    expect(text).not.toContain("service=commit-message")
  })

  test("pushes after committing when --push is set", async () => {
    const calls: string[] = []
    await handle({
      dir: "/repo",
      yes: true,
      push: true,
      generate: async () => ({ message: "fix: update file" }),
      analyzeIntent: async () => ({ intents: [{ files: ["file.txt"], description: "update file" }] }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "M  file.txt\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        if (args[0] === "push") return { code: 0, stdout: "pushed\n", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
    })

    expect(calls).toContain("commit -m fix: update file")
    expect(calls.at(-1)).toBe("push")
  })

  test("does not push on dry run even with --push", async () => {
    const calls: string[] = []
    const out: string[] = []

    await handle({
      dir: "/repo",
      yes: true,
      push: true,
      dryRun: true,
      generate: async () => ({ message: "fix: update file" }),
      analyzeIntent: async () => ({ intents: [{ files: ["file.txt"], description: "update file" }] }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "M  file.txt\n", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: (text) => out.push(text),
    })

    expect(calls).not.toContain("push")
    expect(out.join("\n")).toContain("Dry run: push skipped")
  })

  test("runs push when there are no changes and --yes is set", async () => {
    const calls: string[] = []
    const out: string[] = []

    await handle({
      dir: "/repo",
      yes: true,
      git: (args) => {
        calls.push(args.join(" "))
        return { code: 0, stdout: args[0] === "push" ? "pushed\n" : "", stderr: "" }
      },
      output: (text) => out.push(text),
    })

    expect(calls).toEqual(["status --porcelain", "push"])
    const text = out.join("\n")
    expect(text).toContain("No changes found")
    expect(text).toContain("pushed")
  })

  test("reviews status and diffs before committing staged changes", async () => {
    const calls: string[] = []

    await handle({
      dir: "/repo",
      yes: true,
      generate: async () => ({ message: "fix: update file" }),
      analyzeIntent: async () => ({ intents: [{ files: ["file.txt"], description: "update file" }] }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "M  file.txt\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
    })

    expect(calls).toEqual([
      "status --porcelain",
      "diff",
      "diff --staged",
      "reset",
      "add file.txt",
      "diff --cached --quiet",
      "commit -m fix: update file",
    ])
  })

  test("analyzes changes and commits single intent automatically", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "src/auth.ts"), "export function login() {}\n")
    await Bun.write(path.join(tmp.path, "test/auth.test.ts"), "test('login', () => {})\n")

    const calls: string[] = []
    await handle({
      dir: tmp.path,
      yes: true,
      all: true,
      generate: async () => ({ message: "feat: add login" }),
      analyzeIntent: async () => ({ intents: [{ files: ["src/auth.ts", "test/auth.test.ts"], description: "add login feature" }] }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "?? src/auth.ts\n?? test/auth.test.ts\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
    })

    expect(calls).toContain("add src/auth.ts test/auth.test.ts")
    expect(calls).toContain("commit -m feat: add login")
  })

  test("splits multiple intents into separate commits", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "src/api.ts"), "export function api() {}\n")
    await Bun.write(path.join(tmp.path, "docs/readme.md"), "# API docs\n")

    const calls: string[] = []
    const commits: string[] = []
    await handle({
      dir: tmp.path,
      yes: true,
      all: true,
      generate: async (input) => ({ message: input.intent?.description ?? "update" }),
      analyzeIntent: async () => ({
        intents: [
          { files: ["src/api.ts"], description: "feat: add api endpoint" },
          { files: ["docs/readme.md"], description: "docs: update readme" },
        ],
      }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "?? src/api.ts\n?? docs/readme.md\n", stderr: "" }
        if (args[0] === "commit") commits.push(args.at(-1) ?? "")
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
    })

    expect(calls).toContain("add src/api.ts")
    expect(calls).toContain("commit -m feat: add api endpoint")
    expect(calls).toContain("add docs/readme.md")
    expect(calls).toContain("commit -m docs: update readme")
    expect(commits).toEqual(["feat: add api endpoint", "docs: update readme"])
  })

  test("uses staged files when already staged", async () => {
    const calls: string[] = []
    await handle({
      dir: "/repo",
      yes: true,
      generate: async () => ({ message: "fix: bug" }),
      analyzeIntent: async () => ({ intents: [{ files: ["src/fix.ts"], description: "fix bug" }] }),
      git: (args) => {
        calls.push(args.join(" "))
        if (args.join(" ") === "status --porcelain") return { code: 0, stdout: "A  src/fix.ts\n", stderr: "" }
        if (args.join(" ") === "diff --cached --quiet") return { code: 1, stdout: "", stderr: "" }
        return { code: 0, stdout: "", stderr: "" }
      },
      output: () => {},
    })

    expect(calls).toContain("reset")
    expect(calls).toContain("add src/fix.ts")
    expect(calls).toContain("commit -m fix: bug")
  })

  test("regenerates with previous message", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "file.txt"), "hello\n")
    await $`git add file.txt`.cwd(tmp.path).quiet()
    const previous: Array<string | undefined> = []
    const actions: Array<"regenerate" | "commit"> = ["regenerate", "commit"]

    await handle({
      dir: tmp.path,
      generate: async (input) => {
        previous.push(input.previousMessage)
        return { message: input.previousMessage ? "feat: add regenerated file" : "feat: add file" }
      },
      selectAction: async () => actions.shift() ?? "commit",
      output: () => {},
    })

    expect(previous).toEqual([undefined, "feat: add file"])
    expect(await log(tmp.path)).toBe("feat: add regenerated file")
  })
})
