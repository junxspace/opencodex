import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import "opentui-spinner/solid"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: {
  children?: JSX.Element | string
  suffix?: string
  suffixColor?: RGBA
  color?: RGBA
}) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.textMuted
  const suffixColor = () => props.suffixColor ?? theme.textMuted
  return (
    <Show when={kv.get("animations_enabled", true)} fallback={<text fg={color()}>⋯ {props.children}{props.suffix ? ` ${props.suffix}` : ""}</text>}>
      <box flexDirection="row" gap={1}>
        <spinner frames={SPINNER_FRAMES} interval={80} color={color()} />
        <Show when={props.children !== undefined || props.suffix}>
          <box flexDirection="row">
            <Show when={props.children !== undefined}>
              <text fg={color()}>{props.children}</text>
            </Show>
            <Show when={props.suffix}>
              <text fg={suffixColor()}>{` ${props.suffix}`}</text>
            </Show>
          </box>
        </Show>
      </box>
    </Show>
  )
}
