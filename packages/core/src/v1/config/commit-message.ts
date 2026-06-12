import { Schema } from "effect"

export const CommitMessage = Schema.optional(
  Schema.Struct({
    prompt: Schema.optional(Schema.String).annotate({
      description:
        "Custom system prompt for AI commit message generation. When set, replaces the default conventional commits prompt entirely.",
    }),
    model: Schema.optional(Schema.String).annotate({
      description:
        "Model for commit message generation in provider/model format (e.g. anthropic/claude-haiku-4-5). Falls back to small_model then model when unset.",
    }),
    lock_template: Schema.optional(Schema.String).annotate({
      description:
        'Template for lock-only commits. Use {file} for the lock filename. Default: "chore(deps): 更新 {file}".',
    }),
  }),
).annotate({ description: "Configuration for AI-generated commit messages" })
