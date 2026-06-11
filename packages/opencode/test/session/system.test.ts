import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import { SystemPrompt } from "../../src/session/system"
import { Config } from "../../src/config/config"
import { LocationServiceMap } from "@opencode-ai/core/location-layer"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  SystemPrompt.layer.pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(LocationServiceMap.layer),
    Layer.provide(
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
        }),
      ),
    ),
  ),
)

describe("session.system", () => {
  it.instance("skills output uses compact catalog by default", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.skills(build)

      expect(output).toContain("**alpha-skill**")
      expect(output).toContain("**middle-skill**")
      expect(output).toContain("**zeta-skill**")
      expect(output?.indexOf("**alpha-skill**") ?? -1).toBeLessThan(output?.indexOf("**middle-skill**") ?? 0)
      expect(output?.indexOf("**middle-skill**") ?? -1).toBeLessThan(output?.indexOf("**zeta-skill**") ?? 0)
      expect(output).not.toContain("manual-skill")
      expect(output).not.toContain("file://")
    }),
  )

  it.instance(
    "skills output can use verbose catalog",
    () =>
      Effect.gen(function* () {
        const prompt = yield* SystemPrompt.Service
        const output = yield* prompt.skills(build)
        const text = output ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

        const alpha = text.indexOf("<name>alpha-skill</name>")
        const middle = text.indexOf("<name>middle-skill</name>")
        const zeta = text.indexOf("<name>zeta-skill</name>")

        expect(alpha).toBeGreaterThan(-1)
        expect(middle).toBeGreaterThan(alpha)
        expect(zeta).toBeGreaterThan(middle)
        expect(text).not.toContain("manual-skill")
      }),
    { config: { skills: { catalog: "verbose" } } },
  )
})
