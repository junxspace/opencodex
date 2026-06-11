import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { getGitContext, MAX_TOTAL_DIFF_LENGTH } from "@/commit-message/git-context"

describe("commit-message.git-context", () => {
  test("caps total diff content across many files", async () => {
    await using tmp = await tmpdir({ git: true })
    const fileCount = 60
    for (let i = 0; i < fileCount; i++) {
      const filePath = path.join(tmp.path, `src/file-${i}.ts`)
      await Bun.write(filePath, `export const value${i} = "${"x".repeat(2000)}"\n`)
      Bun.spawnSync(["git", "add", filePath], { cwd: tmp.path })
    }

    const ctx = await getGitContext(tmp.path)
    const total = ctx.files.reduce((sum, file) => sum + file.diff.length, 0)

    expect(ctx.files.length).toBe(fileCount)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_DIFF_LENGTH)
    expect(ctx.files.at(-1)?.diff).toBe("")
    expect(ctx.files.some((file) => file.diff.length > 0)).toBe(true)
  })
})
