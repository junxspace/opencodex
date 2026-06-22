import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Catalog } from "@opencode-ai/core/catalog"
import { Config } from "@opencode-ai/core/config"
import { ConfigProviderAllowlistPlugin } from "@opencode-ai/core/config/plugin/provider-allowlist"
import { ConfigProviderPlugin } from "@opencode-ai/core/config/plugin/provider"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "../plugin/fixture"

const it = testEffect(PluginTestLayer)

const decode = Schema.decodeUnknownSync(Config.Info)

const addPlugins = Effect.fn(function* (config: Config.Interface) {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make()
  for (const item of [ConfigProviderPlugin.Plugin, ConfigProviderAllowlistPlugin.Plugin]) {
    yield* plugin.add({
      ...item,
      effect: item.effect(host).pipe(Effect.provideService(Config.Service, config)),
    })
  }
})

describe("ConfigProviderAllowlistPlugin.Plugin", () => {
  it.effect("removes providers outside enabled_providers from the catalog", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({
                enabled_providers: ["token-router"],
                providers: {
                  "token-router": {
                    api: {
                      type: "aisdk",
                      package: "@ai-sdk/openai-compatible",
                      url: "https://router.example.com/v1",
                    },
                    models: {
                      "MiniMax-M3": { name: "MiniMax-M3" },
                    },
                  },
                  deepseek: {
                    api: {
                      type: "aisdk",
                      package: "@ai-sdk/openai-compatible",
                      url: "https://api.deepseek.com/v1",
                    },
                    models: {
                      "deepseek-chat": { name: "DeepSeek Chat" },
                    },
                  },
                },
              }),
            }),
          ]),
      })

      yield* addPlugins(config)

      const providers = yield* catalog.provider.all()
      expect(providers.map((item) => item.id)).toEqual([ProviderV2.ID.make("token-router")])
      expect((yield* catalog.model.available()).map((item) => `${item.providerID}/${item.id}`)).toEqual([
        "token-router/MiniMax-M3",
      ])
    }),
  )

  it.effect("removes disabled providers case-insensitively", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({
                disabled_providers: ["DeepSeek"],
                providers: {
                  deepseek: {
                    api: {
                      type: "aisdk",
                      package: "@ai-sdk/openai-compatible",
                      url: "https://api.deepseek.com/v1",
                    },
                    models: {
                      "deepseek-chat": { name: "DeepSeek Chat" },
                    },
                  },
                  anthropic: {
                    api: {
                      type: "aisdk",
                      package: "@ai-sdk/anthropic",
                      url: "https://api.anthropic.com/v1",
                    },
                    models: {
                      "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" },
                    },
                  },
                },
              }),
            }),
          ]),
      })

      yield* addPlugins(config)

      const providers = yield* catalog.provider.all()
      expect(providers.map((item) => item.id)).toEqual([ProviderV2.ID.make("anthropic")])
      expect(
        (yield* catalog.model.available()).some((item) => item.providerID === ProviderV2.ID.make("deepseek")),
      ).toBe(false)
    }),
  )
})
