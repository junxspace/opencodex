export * as ConfigTokenUsageV1 from "./token-usage"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "../../schema"

const Argv = Schema.mutable(Schema.Array(Schema.String.check(Schema.isMinLength(1))))

export const Provider = Schema.Struct({
  command: Argv.annotate({
    description:
      "Adapter command (argv array, no shell). Must print a single JSON object on stdout matching the TokenUsage schema.",
  }),
  refresh_interval: Schema.optional(NonNegativeInt).annotate({
    description:
      "Minimum seconds between adapter invocations. When unset, the backend falls back to a built-in default (default: 60).",
  }),
  timeout: Schema.optional(PositiveInt).annotate({
    description:
      "Adapter execution timeout in milliseconds. When unset, the backend falls back to a built-in default (default: 10000).",
  }),
}).annotate({ identifier: "TokenUsageProvider" })
export type Provider = Schema.Schema.Type<typeof Provider>
