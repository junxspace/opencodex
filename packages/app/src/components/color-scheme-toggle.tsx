import { createMemo, For, Show } from "solid-js"
import { useTheme, type ColorScheme } from "@opencode-ai/ui/theme/context"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"

const schemes = ["light", "dark"] as const satisfies readonly ColorScheme[]

export function ColorSchemeToggle() {
  const platform = usePlatform()
  const theme = useTheme()
  const language = useLanguage()
  const settings = useSettings()
  const v2 = createMemo(() => settings.general.newLayoutDesigns())
  const active = createMemo(() => theme.mode())
  const options = createMemo(() =>
    schemes.map((scheme) => ({
      scheme,
      label: language.t(scheme === "light" ? "theme.scheme.light" : "theme.scheme.dark"),
      icon: scheme === "light" ? ("sun" as const) : ("moon" as const),
    })),
  )

  return (
    <Show when={platform.platform === "web"}>
      <div
        role="radiogroup"
        aria-label={language.t("settings.general.row.colorScheme.title")}
        data-component="color-scheme-toggle"
        data-variant={v2() ? "v2" : "legacy"}
        class="[app-region:no-drag]"
      >
        <For each={options()}>
          {(option) => (
            <Tooltip placement="bottom" value={option.label}>
              <button
                type="button"
                role="radio"
                aria-checked={active() === option.scheme}
                aria-label={option.label}
                data-active={active() === option.scheme ? "" : undefined}
                onClick={() => theme.setColorScheme(option.scheme)}
              >
                <Show when={v2()} fallback={<Icon name={option.icon} size="small" />}>
                  <IconV2 name={option.icon} size="small" />
                </Show>
                <span data-slot="color-scheme-toggle-label">{option.label}</span>
              </button>
            </Tooltip>
          )}
        </For>
      </div>
    </Show>
  )
}
