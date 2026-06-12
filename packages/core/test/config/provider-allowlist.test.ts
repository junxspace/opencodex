import { describe, expect, test } from "bun:test"
import { isProviderAllowed } from "@opencode-ai/core/config/provider-allowlist"

describe("ConfigProviderAllowlist.isProviderAllowed", () => {
  test("allows all providers when no allowlist is configured", () => {
    expect(isProviderAllowed("deepseek")).toBe(true)
    expect(isProviderAllowed("deepseek", { disabled: [] })).toBe(true)
  })

  test("enabled_providers restricts to listed providers", () => {
    expect(isProviderAllowed("anthropic", { enabled: ["anthropic", "openai"] })).toBe(true)
    expect(isProviderAllowed("google", { enabled: ["anthropic", "openai"] })).toBe(false)
  })

  test("disabled_providers excludes listed providers", () => {
    expect(isProviderAllowed("deepseek", { disabled: ["deepseek"] })).toBe(false)
    expect(isProviderAllowed("anthropic", { disabled: ["deepseek"] })).toBe(true)
  })

  test("matches provider ids case-insensitively", () => {
    expect(isProviderAllowed("deepseek", { disabled: ["DeepSeek"] })).toBe(false)
    expect(isProviderAllowed("token-router", { enabled: ["Token-Router"] })).toBe(true)
  })

  test("enabled_providers takes precedence before disabled_providers", () => {
    expect(
      isProviderAllowed("openai", {
        enabled: ["anthropic", "openai"],
        disabled: ["openai"],
      }),
    ).toBe(false)
    expect(
      isProviderAllowed("google", {
        enabled: ["anthropic", "openai"],
        disabled: ["openai"],
      }),
    ).toBe(false)
  })
})
