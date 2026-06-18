export * as MemoryTool from "./memory"

import { ToolFailure } from "@opencode-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { Memory } from "../memory"
import { PermissionV2 } from "../permission"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "memory"

export const Input = Schema.Struct({
  query: Schema.String.annotate({ description: "Search query to find relevant memory entries" }),
  scope: Schema.optional(Schema.Literals(["global", "projects", "sessions"])).annotate({
    description: "Filter by scope: global, projects, or sessions",
  }),
  scope_id: Schema.optional(Schema.String).annotate({
    description: "Filter by scope ID (project ID or session ID)",
  }),
  type: Schema.optional(Schema.Literals(["memory", "checkpoint", "progress", "notes"])).annotate({
    description: "Filter by memory type",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of results to return (default 10)",
  }),
})

export const Output = Schema.Array(
  Schema.Struct({
    path: Schema.String,
    scope: Schema.String,
    scope_id: Schema.String,
    type: Schema.String,
    snippet: Schema.String,
    score: Schema.Number,
  }),
)
type ModelOutput = typeof Output.Encoded

export const toModelOutput = (output: ModelOutput) => {
  if (output.length === 0) return "No memory entries found matching your query."
  const lines = [`Found ${output.length} memory entries:`, ""]
  for (const entry of output) {
    lines.push(`### ${entry.type} (${entry.scope}/${entry.scope_id})`)
    lines.push(`Path: ${entry.path}`)
    lines.push(`Score: ${entry.score.toFixed(2)}`)
    lines.push(`Snippet: ${entry.snippet}`)
    lines.push("")
  }
  return lines.join("\n")
}

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const memory = yield* Memory.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Search persistent memory (read-only). Finds project MEMORY.md, session checkpoint.md, notes.md, and progress files. To save new knowledge use the /remember command or read/write/edit on the returned paths — this tool does not write.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: toModelOutput(output) }],
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* permission.assert({
                action: name,
                resources: [input.query],
                save: ["*"],
                metadata: { scope: input.scope, scope_id: input.scope_id, type: input.type, limit: input.limit },
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })
              yield* memory.reconcile()
              const results = yield* memory.search({
                query: input.query,
                scope: input.scope,
                scopeId: input.scope_id,
                type: input.type,
                limit: input.limit ?? 10,
              })
              return results.map((r) => ({
                path: r.path,
                scope: r.scope,
                scope_id: r.scopeId,
                type: r.type,
                snippet: r.snippet,
                score: r.score,
              }))
            }).pipe(Effect.mapError(() => new ToolFailure({ message: `Memory search failed for: ${input.query}` }))),
        }),
      })
      .pipe(Effect.orDie)
  }),
)