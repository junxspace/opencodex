import { describe, expect, test } from "bun:test"
import { Duration, Effect, Exit, Cause } from "effect"
import { turnPrepareTimeout, isTurnPrepareTimeout } from "@/session/prompt"

describe("session.turnPrepareTimeout", () => {
  test("returns the effect result when it finishes in time", async () => {
    const value = await Effect.runPromise(turnPrepareTimeout(Effect.succeed("ok"), 1000))
    expect(value).toBe("ok")
  })

  test("fails when preparation exceeds the timeout", async () => {
    const exit = await Effect.runPromise(turnPrepareTimeout(Effect.sleep(Duration.millis(50)), 5).pipe(Effect.exit))
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) return
    expect(isTurnPrepareTimeout(Cause.squash(exit.cause))).toBe(true)
  })

  test("skips timeout when disabled", async () => {
    const value = await Effect.runPromise(turnPrepareTimeout(Effect.succeed("ok"), undefined))
    expect(value).toBe("ok")
  })
})
