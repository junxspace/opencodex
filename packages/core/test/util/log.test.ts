import { afterEach, describe, expect, test } from "bun:test"
import * as Log from "../../src/util/log"

const saved = {
  print: process.env.OPENCODE_PRINT_LOGS,
  stderr: process.stderr.write,
}

afterEach(() => {
  if (saved.print === undefined) delete process.env.OPENCODE_PRINT_LOGS
  else process.env.OPENCODE_PRINT_LOGS = saved.print
  process.stderr.write = saved.stderr
})

describe("util/log", () => {
  test("init with print:false writes to file instead of stderr", async () => {
    delete process.env.OPENCODE_PRINT_LOGS
    const writes: string[] = []
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk))
      return true
    }) as typeof process.stderr.write

    await Log.init({ print: false, dev: true, level: "INFO" })
    Log.create({ service: "test-log" }).info("hello file")

    await Bun.sleep(20)

    expect(writes).toEqual([])
    expect(Log.file()).toContain("dev.log")
    const text = await Bun.file(Log.file()).text()
    expect(text).toContain("service=test-log hello file")
  })
})
