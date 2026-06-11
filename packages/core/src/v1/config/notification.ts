import { Schema } from "effect"

export const Notification = Schema.optional(
  Schema.Struct({
    enabled: Schema.optional(Schema.Boolean).annotate({
      description: "Enable task completion notifications",
    }),
    webhookUrl: Schema.optional(Schema.String).annotate({
      description: "Webhook URL for sending notifications (e.g. Feishu bot webhook)",
    }),
    notify_action: Schema.optional(Schema.Literal("webhook")).annotate({
      description: "Notification delivery action",
    }),
    enabled_events: Schema.optional(Schema.Array(Schema.String)).annotate({
      description: "Whitelist of notification events to send",
    }),
    disabled_events: Schema.optional(Schema.Array(Schema.String)).annotate({
      description: "Blacklist of notification events to skip",
    }),
  }),
).annotate({ description: "Webhook notification configuration" })
