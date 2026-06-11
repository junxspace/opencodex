export * as ConfigSkillsV1 from "./skills"

import { Schema } from "effect"

export const Info = Schema.Struct({
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Additional paths to skill folders",
  }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "URLs to fetch skills from (e.g., https://example.com/.well-known/skills/)",
  }),
  catalog: Schema.optional(Schema.Literals(["verbose", "compact", "none"])).annotate({
    description:
      "How skill names and descriptions are injected into the system prompt. compact omits file locations (default). none moves the catalog into the skill tool description.",
  }),
})
export type Info = Schema.Schema.Type<typeof Info>
