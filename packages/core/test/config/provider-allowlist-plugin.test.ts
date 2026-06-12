import { describe, expect } from "bun:test"
import { Effect, Exit, Schema } from "effect"
import { Catalog } from "@opencode-ai/core/catalog"
import { Config } from "@opencode-ai/core/config"
import { ConfigProviderAllowlistPlugin } from "@opencode-ai/core/config/plugin/provider-allowlist"
import { ConfigProviderPlugin } from "@opencode-ai/core/config/plugin/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { it } from "../plugin/provider-helper"

const decode = Schema.decodeUnknownSync(Config.Info)

describe("ConfigProviderAllowlistPlugin.Plugin", () => {
  it.effect("removes providers outside enabled_providers from the catalog", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const plugin = yield* PluginV2.Service
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

      for (const item of [ConfigProviderPlugin.Plugin, ConfigProviderAllowlistPlugin.Plugin]) {
        yield* plugin.add({
          ...item,
          effect: item.effect.pipe(
            Effect.provideService(Config.Service, config),
            Effect.provideService(Catalog.Service, catalog),
          ),
        })
      }

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
      const plugin = yield* PluginV2.Service
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

      for (const item of [ConfigProviderPlugin.Plugin, ConfigProviderAllowlistPlugin.Plugin]) {
        yield* plugin.add({
          ...item,
          effect: item.effect.pipe(
            Effect.provideService(Config.Service, config),
            Effect.provideService(Catalog.Service, catalog),
          ),
        })
      }

      const providers = yield* catalog.provider.all()
      expect(providers.map((item) => item.id)).toEqual([ProviderV2.ID.make("anthropic")])
      const exit = yield* catalog.model
        .get(ProviderV2.ID.make("deepseek"), ModelV2.ID.make("deepseek-chat"))
        .pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )
})
