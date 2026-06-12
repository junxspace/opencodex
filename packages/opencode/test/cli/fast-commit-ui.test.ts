import { describe, expect, test } from "bun:test"
import { commitUi } from "../../src/cli/cmd/fast-commit-ui"
import { Style } from "../../src/cli/ui"

describe("fast-commit ui", () => {
  test("statusOverview includes sections and separators", () => {
    const ui = commitUi(Style)
    const text = ui.statusOverview({
      staged: ["a.ts"],
      unstaged: ["b.ts"],
      untracked: [],
    })

    expect(text).toContain("⚡ fast-commit")
    expect(text).toContain("📦 Staged")
    expect(text).toContain("📝 Unstaged")
    expect(text).toContain("· a.ts")
    expect(text).toContain("· none")
    expect(text).toContain("─".repeat(44))
  })

  test("gitCommitOutput highlights commit subject", () => {
    const ui = commitUi(Style)
    const text = ui.gitCommitOutput("[dev abc1234] feat(tui): 修复滚动\n 2 files changed, 10 insertions(+)")

    expect(text).toContain("[dev abc1234]")
    expect(text).toContain("feat(tui): 修复滚动")
    expect(text).toContain("📊")
  })
})
