import { afterEach, describe, expect, test } from "bun:test"
import { Telemetry } from "@opencode-ai/core/telemetry"

afterEach(() => {
  Telemetry.setCaptureHandler(undefined)
  Telemetry.init({ enabled: true })
})

describe("telemetry", () => {
  test("trackLlmCompletion ignores empty token usage", () => {
    const rows: Array<Record<string, unknown>> = []
    Telemetry.setCaptureHandler(({ properties }) => {
      rows.push(properties)
    })

    Telemetry.trackLlmCompletion({
      sessionID: "ses_test",
      providerID: "openai",
      modelID: "gpt-test",
    })

    expect(rows).toEqual([])
  })

  test("trackLlmCompletion captures token and timing fields", () => {
    const rows: Array<Record<string, unknown>> = []
    Telemetry.setCaptureHandler(({ event, properties }) => {
      rows.push({ event, ...properties })
    })

    Telemetry.trackLlmCompletion({
      sessionID: "ses_test",
      messageID: "msg_test",
      agent: "build",
      providerID: "anthropic",
      modelID: "claude-test",
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 1,
      cacheWriteTokens: 2,
      cost: 0.01,
      durationMs: 1234,
      generationMs: 1234,
      timeToFirstTokenMs: 23_000,
      streamMs: 24_234,
    })

    expect(rows).toEqual([
      expect.objectContaining({
        event: "llm.completion",
        sessionID: "ses_test",
        messageID: "msg_test",
        agent: "build",
        providerID: "anthropic",
        modelID: "claude-test",
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 1,
        cacheWriteTokens: 2,
        cost: 0.01,
        durationMs: 1234,
        generationMs: 1234,
        timeToFirstTokenMs: 23_000,
        streamMs: 24_234,
        runID: expect.any(String),
      }),
    ])
  })

  test("trackToolUsed captures timing and status", () => {
    const rows: Array<Record<string, unknown>> = []
    Telemetry.setCaptureHandler(({ event, properties }) => {
      rows.push({ event, ...properties })
    })

    Telemetry.trackToolUsed({
      tool: "read",
      sessionID: "ses_test",
      messageID: "msg_test",
      durationMs: 2500,
      status: "completed",
    })

    expect(rows).toEqual([
      expect.objectContaining({
        event: "tool.used",
        tool: "read",
        sessionID: "ses_test",
        messageID: "msg_test",
        durationMs: 2500,
        status: "completed",
      }),
    ])
  })

  test("trackTurnCompleted captures end-to-end turn timing", () => {
    const rows: Array<Record<string, unknown>> = []
    Telemetry.setCaptureHandler(({ event, properties }) => {
      rows.push({ event, ...properties })
    })

    Telemetry.trackTurnCompleted({
      sessionID: "ses_test",
      userMessageID: "msg_user",
      assistantMessageID: "msg_assistant",
      agent: "build",
      providerID: "openai",
      modelID: "gpt-test",
      durationMs: 31_700,
      assistantSteps: 2,
      toolCalls: 5,
    })

    expect(rows).toEqual([
      expect.objectContaining({
        event: "turn.completed",
        sessionID: "ses_test",
        userMessageID: "msg_user",
        assistantMessageID: "msg_assistant",
        agent: "build",
        providerID: "openai",
        modelID: "gpt-test",
        durationMs: 31_700,
        assistantSteps: 2,
        toolCalls: 5,
      }),
    ])
  })

  test("respects disabled state", () => {
    const rows: Array<Record<string, unknown>> = []
    Telemetry.setCaptureHandler(({ properties }) => {
      rows.push(properties)
    })
    Telemetry.init({ enabled: false })

    Telemetry.trackLlmCompletion({
      sessionID: "ses_test",
      providerID: "openai",
      modelID: "gpt-test",
      inputTokens: 1,
    })

    expect(rows).toEqual([])
  })
})
