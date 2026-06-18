import { Effect } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Memory } from "@opencode-ai/core/memory"
import * as MemoryPaths from "@opencode-ai/core/memory/paths"
import { Project } from "@opencode-ai/core/project"
import { Config } from "@/config/config"
import { Command } from "@/command"
import { MemoryAuto } from "./memory-auto"
import { InstanceState } from "@/effect/instance-state"
import { Session } from "./session"
import { PartID } from "./schema"

const REMINDER_MARKER = "remember-signal-reminder"
const EXPLICIT_REMEMBER_RE = /(?:^|\s)\/remember(?:\s|$)/i

const USER_REQUEST_PATTERNS = [
  /记住[：:]?\s*(.+)/i,
  /记下来[：:]?\s*(.+)/i,
  /别忘了[：:]?\s*(.+)/i,
  /记得[：:]?\s*(.+)/i,
  /(?:please\s+)?remember\s+(?:that\s+)?(.+)/i,
  /save\s+(?:this\s+)?(?:to\s+)?memory[：:]?\s*(.+)/i,
]

const USER_RULE_RE =
  /(?:以后|今后|从现在开始|from now on).{0,24}(?:都|要|必须|不要|never|always)|(?:必须|一定要|永远不要|never|always|don't ever)\b|(?:不要|禁止|don't)\s+(?:再|ever\s+)/i

export type SignalKind = "user_request" | "user_rule" | "error_fix"

export type RememberSignal = {
  kind: SignalKind
  content: string
  target: "project" | "session"
}

const pending = new Map<string, RememberSignal[]>()

export function detectFromUserText(text: string): RememberSignal | undefined {
  const trimmed = text.trim()
  if (!trimmed || EXPLICIT_REMEMBER_RE.test(trimmed)) return

  for (const pattern of USER_REQUEST_PATTERNS) {
    const match = trimmed.match(pattern)
    const content = match?.[1]?.trim()
    if (content) return { kind: "user_request", content, target: "project" }
  }

  if (USER_RULE_RE.test(trimmed)) {
    return {
      kind: "user_rule",
      content: trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed,
      target: "project",
    }
  }
}

export function detectErrorFix(parts: SessionV1.Part[]): RememberSignal | undefined {
  let hadError = false
  let hadSuccess = false
  for (const part of parts) {
    if (part.type !== "tool") continue
    if (part.state.status === "error") hadError = true
    if (part.state.status === "completed") hadSuccess = true
  }
  if (!hadError || !hadSuccess) return

  const text = parts
    .filter((part): part is SessionV1.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim()
  if (!text) return

  return {
    kind: "error_fix",
    content: `Resolved tool errors: ${text.length > 280 ? `${text.slice(0, 277)}...` : text}`,
    target: "session",
  }
}

function userText(message: SessionV1.WithParts) {
  return message.parts
    .filter((part): part is SessionV1.TextPart => part.type === "text" && !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join("\n")
    .trim()
}

function isRememberSubtask(message: SessionV1.WithParts) {
  return message.parts.some((part) => part.type === "subtask" && part.command === Command.Default.REMEMBER)
}

function hasRememberReminder(message: SessionV1.WithParts) {
  return message.parts.some((part) => part.type === "text" && part.synthetic && part.text.includes(REMINDER_MARKER))
}

function rememberEnabled(cfg: {
  plugin?: unknown[]
  plugin_origins?: { spec: unknown }[]
  remember?: { auto?: boolean; suggest?: boolean; auto_write?: boolean }
}) {
  return MemoryAuto.rememberAutoEnabled(cfg)
}

function rememberSuggest(cfg: {
  remember?: { auto?: boolean; suggest?: boolean; auto_write?: boolean }
}) {
  return rememberEnabled(cfg) && cfg.remember?.suggest !== false
}

function rememberAutoWrite(cfg: {
  remember?: { auto?: boolean; suggest?: boolean; auto_write?: boolean }
}) {
  return rememberEnabled(cfg) && cfg.remember?.auto_write === true
}

function queueSignal(sessionID: string, signal: RememberSignal) {
  pending.set(sessionID, [...(pending.get(sessionID) ?? []), signal])
}

export function takePendingSignals(sessionID: string) {
  const signals = pending.get(sessionID) ?? []
  pending.delete(sessionID)
  return signals
}

function formatReminder(input: { signal: RememberSignal; projectMemoryPath: string; autoWritten?: string }) {
  const lines = [
    "<system-reminder>",
    REMINDER_MARKER,
    `Memory signal detected (${input.signal.kind}).`,
    "",
    "Suggested content to save:",
    input.signal.content,
    "",
  ]
  if (input.autoWritten) {
    lines.push(`Auto-saved to session notes: ${input.autoWritten}`, "")
  }
  if (input.signal.target === "project") {
    lines.push(
      `Save with /remember, or read and append to project memory at ${input.projectMemoryPath}.`,
      "Do not explore memory directories with bash.",
    )
  }
  if (input.signal.target === "session") {
    lines.push(
      "Consider saving to session notes with /remember --session, or promoting durable items to project memory.",
    )
  }
  lines.push("</system-reminder>")
  return lines.join("\n")
}

export function appendNote(sessionID: string, line: string) {
  return Effect.gen(function* () {
    const notesPath = MemoryPaths.notesPath(sessionID)
    const memory = yield* Memory.Service
    const existing = yield* memory.readBody(notesPath).pipe(Effect.catch(() => Effect.succeed("")))
    const date = new Date().toISOString().slice(0, 10)
    const prefix = existing.trim() ? "" : "# Session notes\n\n"
    const body = `${existing.trimEnd()}${existing.trim() ? "\n" : prefix}- (${date}) ${line}\n`
    yield* memory.writeBody(notesPath, body)
    const fingerprint = `${body.length}-${Date.now()}`
    yield* memory
      .index({
        path: notesPath,
        scope: "sessions",
        scopeId: sessionID,
        type: "notes",
        body,
        fingerprint,
      })
      .pipe(Effect.catch(() => memory.reconcile().pipe(Effect.catch(() => Effect.void))))
    return notesPath
  })
}

export const applyUserTurn = Effect.fn("RememberTrigger.applyUserTurn")(function* (input: {
  messages: SessionV1.WithParts[]
  agent: { hidden?: boolean }
  sessionID: string
}) {
  if (input.agent.hidden) return input.messages

  const cfg = yield* Config.Service.pipe(Effect.flatMap((svc) => svc.get()))
  if (!rememberEnabled(cfg)) return input.messages

  const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
  if (!userMessage || isRememberSubtask(userMessage) || hasRememberReminder(userMessage)) return input.messages

  const signals = [
    ...takePendingSignals(input.sessionID),
    ...[detectFromUserText(userText(userMessage))].filter((signal): signal is RememberSignal => signal !== undefined),
  ]
  if (signals.length === 0) return input.messages
  if (!rememberSuggest(cfg) && !rememberAutoWrite(cfg)) return input.messages

  const ctx = yield* InstanceState.context
  const projectMemoryPath = MemoryPaths.projectMemoryPath(
    Project.ID.make(MemoryPaths.projectIDFromPath(ctx.worktree)),
  )
  const sessions = yield* Session.Service

  for (const signal of signals) {
    const autoWritten = rememberAutoWrite(cfg)
      ? yield* appendNote(input.sessionID, signal.content).pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined

    if (!rememberSuggest(cfg)) continue

    const part = yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: userMessage.info.id,
      sessionID: userMessage.info.sessionID,
      type: "text",
      text: formatReminder({ signal, projectMemoryPath, autoWritten }),
      synthetic: true,
    })
    userMessage.parts.push(part)
  }

  return input.messages
})

export const afterAssistantTurn = Effect.fn("RememberTrigger.afterAssistantTurn")(function* (input: {
  sessionID: string
  message: SessionV1.WithParts
}) {
  if (input.message.info.role !== "assistant" || input.message.info.summary) return
  if (input.message.info.error) return
  if (input.message.info.finish && ["error", "tool-calls", "unknown"].includes(input.message.info.finish)) return

  const cfg = yield* Config.Service.pipe(Effect.flatMap((svc) => svc.get()))
  if (!rememberEnabled(cfg)) return

  const signal = detectErrorFix(input.message.parts)
  if (!signal) return

  if (rememberAutoWrite(cfg)) {
    yield* appendNote(input.sessionID, signal.content).pipe(Effect.catch(() => Effect.void))
  }

  if (!rememberSuggest(cfg)) return
  queueSignal(input.sessionID, signal)
})

export * as RememberTrigger from "./remember-trigger"
