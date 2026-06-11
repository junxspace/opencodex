import { runID } from "../observability/shared"

export const Event = {
  LlmCompletion: "llm.completion",
  ToolUsed: "tool.used",
  TurnCompleted: "turn.completed",
  CliStart: "cli.start",
  CliExit: "cli.exit",
} as const

export type Event = (typeof Event)[keyof typeof Event]

export type CaptureHandler = (input: { event: Event; properties: Record<string, unknown> }) => void

let enabled = true
let capture: CaptureHandler | undefined

export function init(input?: { enabled?: boolean }) {
  if (input?.enabled !== undefined) enabled = input.enabled
}

export function setEnabled(value: boolean) {
  enabled = value
}

export function isEnabled() {
  return enabled
}

export function setCaptureHandler(handler: CaptureHandler | undefined) {
  capture = handler
}

export function track(event: Event, properties?: Record<string, unknown>) {
  if (!enabled || !capture) return
  capture({
    event,
    properties: {
      runID,
      ...properties,
    },
  })
}

export function trackLlmCompletion(input: {
  sessionID: string
  messageID?: string
  agent?: string
  providerID: string
  modelID: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  cost?: number
  durationMs?: number
  generationMs?: number
  timeToFirstTokenMs?: number
  streamMs?: number
}) {
  const tokens = {
    input: input.inputTokens ?? 0,
    output: input.outputTokens ?? 0,
    cacheRead: input.cacheReadTokens ?? 0,
    cacheWrite: input.cacheWriteTokens ?? 0,
  }
  if (tokens.input === 0 && tokens.output === 0 && tokens.cacheRead === 0 && tokens.cacheWrite === 0) return

  const generationMs = input.generationMs ?? input.durationMs

  track(Event.LlmCompletion, {
    sessionID: input.sessionID,
    messageID: input.messageID,
    agent: input.agent,
    providerID: input.providerID,
    modelID: input.modelID,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cacheReadTokens: tokens.cacheRead,
    cacheWriteTokens: tokens.cacheWrite,
    cost: input.cost,
    durationMs: generationMs,
    generationMs,
    timeToFirstTokenMs: input.timeToFirstTokenMs,
    streamMs: input.streamMs,
  })
}

export function trackToolUsed(input: {
  tool: string
  sessionID?: string
  messageID?: string
  durationMs?: number
  status?: "completed" | "error"
}) {
  track(Event.ToolUsed, input)
}

export function trackTurnCompleted(input: {
  sessionID: string
  userMessageID: string
  assistantMessageID: string
  agent?: string
  providerID?: string
  modelID?: string
  durationMs: number
  assistantSteps?: number
  toolCalls?: number
}) {
  track(Event.TurnCompleted, input)
}
