import { describe, expect, test } from "bun:test"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { AttachCommand } from "../../../src/cli/cmd/attach"
import { resolveThreadDirectory } from "../../../src/cli/cmd/tui"

async function parse(argv: string[]) {
  return yargs(hideBin(argv))
    .command({
      ...AttachCommand,
      handler: () => {},
    })
    .fail(false)
    .parse()
}

describe("attach defaults", () => {
  test("bare attach uses default server url and resolves directory at runtime", async () => {
    const argv = await parse(["node", "opencode", "attach"])
    expect(argv.url).toBe("http://127.0.0.1:4096")
    expect(argv.dir).toBeUndefined()
    expect(resolveThreadDirectory()).toBe(process.cwd())
  })

  test("attach accepts explicit url and dir overrides", async () => {
    const argv = await parse([
      "node",
      "opencode",
      "attach",
      "http://example.com:1234",
      "--dir",
      "/tmp/custom-project",
    ])
    expect(argv.url).toBe("http://example.com:1234")
    expect(argv.dir).toBe("/tmp/custom-project")
  })
})
