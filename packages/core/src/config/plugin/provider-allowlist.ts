export * as ConfigProviderAllowlistPlugin from "./provider-allowlist"

import { define } from "@opencode-ai/plugin/v2/effect"
import { Effect } from "effect"
import { Catalog } from "../../catalog"
import { Config } from "../../config"
import { isProviderAllowed } from "../provider-allowlist"

export const Plugin = define({
  id: "config-provider-allowlist",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const entries = yield* config.entries()
    const enabled = Config.latest(entries, "enabled_providers")
    const disabled = Config.latest(entries, "disabled_providers")
    if (!enabled && !disabled) return

    yield* ctx.catalog.transform((editor) => {
      for (const record of editor.provider.list()) {
        if (!isProviderAllowed(record.provider.id, { enabled, disabled })) editor.provider.remove(record.provider.id)
      }
    })
  }),
})
