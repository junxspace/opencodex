export * as ConfigProviderAllowlistPlugin from "./provider-allowlist"

import { Effect } from "effect"
import { Catalog } from "../../catalog"
import { Config } from "../../config"
import { isProviderAllowed } from "../provider-allowlist"
import { PluginV2 } from "../../plugin"

export const Plugin = PluginV2.define({
  id: PluginV2.ID.make("config-provider-allowlist"),
  effect: Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    const config = yield* Config.Service
    const transform = yield* catalog.transform()
    const entries = yield* config.entries()
    const enabled = Config.latest(entries, "enabled_providers")
    const disabled = Config.latest(entries, "disabled_providers")
    if (!enabled && !disabled) return

    yield* transform((editor) => {
      for (const record of editor.provider.list()) {
        if (!isProviderAllowed(record.provider.id, { enabled, disabled })) editor.provider.remove(record.provider.id)
      }
    })
  }),
})
