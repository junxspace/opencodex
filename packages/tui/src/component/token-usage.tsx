import { useLocal } from "../context/local"
import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import type { TokenUsage, TokenUsageWindow } from "@opencode-ai/sdk/v2"

export type { TokenUsage, TokenUsageWindow }

const BAR_WIDTH = 16
const DEFAULT_REFRESH_SECONDS = 60

function formatRelative(timestampMs: number, now: number): string {
  if (!Number.isFinite(timestampMs)) return ""
  const diff = timestampMs - now
  const abs = Math.abs(diff)
  const totalMinutes = Math.round(abs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  let value: string
  if (days > 0) value = `${days}d ${remHours}h`
  else if (hours > 0) value = `${hours}h ${minutes}m`
  else value = `${minutes}m`
  return diff >= 0 ? value : `${value} ago`
}

function renderBar(percent: number): { filled: string; empty: string; label: string } {
  const safe = Number.isFinite(percent) ? percent : 0
  const clamped = Math.max(0, Math.min(100, safe))
  const filled = Math.round((clamped / 100) * BAR_WIDTH)
  return {
    filled: "█".repeat(filled),
    empty: "░".repeat(Math.max(0, BAR_WIDTH - filled)),
    label: `${Math.round(clamped)}%`,
  }
}

function refreshSecondsFor(): number {
  return DEFAULT_REFRESH_SECONDS
}

export function TokenUsageSidebar() {
  const sdk = useSDK()
  const local = useLocal()
  const { theme } = useTheme()
  const [now, setNow] = createSignal(Date.now())

  const providerID = createMemo(() => local.model.current()?.providerID)
  const enabled = createMemo(() => Boolean(providerID()))

  const [usage, { refetch }] = createResource(
    () => (enabled() ? providerID() : undefined),
    async (id) => {
      if (!id) return null
      const result = await sdk.client.tokenUsage.get({ providerID: id })
      return result.data ?? null
    },
  )

  onMount(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(tick))
  })

  onMount(() => {
    const seconds = refreshSecondsFor()
    const interval = setInterval(() => {
      void refetch()
    }, seconds * 1000)
    onCleanup(() => clearInterval(interval))
  })

  createEffect(() => {
    const snapshot = usage()
    const id = providerID()
    if (!snapshot || !id) return
    const future = [snapshot.five_hour?.reset_at, snapshot.weekly?.reset_at]
      .filter((t): t is number => Number.isFinite(t))
      .filter((t) => t > Date.now())
    if (future.length === 0) return
    const nextReset = Math.min(...future)
    const timer = setTimeout(() => {
      void sdk.client.tokenUsage.refresh({ providerID: id }).then(() => refetch())
    }, nextReset - Date.now() + 100)
    onCleanup(() => clearTimeout(timer))
  })

  const value = createMemo(() => usage() ?? null)
  const errorMessage = createMemo(() => value()?.error)
  const visible = createMemo(
    () => enabled() && value() !== null && (value()?.five_hour || value()?.weekly || value()?.error),
  )

  return (
    <Show when={visible()}>
      <box>
        <text>
          <b>
            <span style={{ fg: theme.text }}>Token Quota</span>
          </b>
        </text>
        <Show when={value()?.five_hour}>
          <UsageRow label="5H" window={value()!.five_hour!} now={now()} />
        </Show>
        <Show when={value()?.weekly}>
          <UsageRow label="WK" window={value()!.weekly!} now={now()} />
        </Show>
        <Show when={errorMessage()}>
          <text fg={theme.warning}>{`⚠ ${errorMessage()}`}</text>
        </Show>
      </box>
    </Show>
  )
}

function UsageRow(props: { label: string; window: TokenUsageWindow; now: number }) {
  const { theme } = useTheme()
  const bar = createMemo(() => renderBar(Number(props.window.used_percent)))
  const reset = createMemo(() => formatRelative(props.window.reset_at, props.now))
  return (
    <box>
      <text wrapMode="none">
        <span style={{ fg: theme.textMuted }}>{props.label.padEnd(3, " ")}</span>{" "}
        <span style={{ fg: theme.text }}>{bar().filled}</span>
        <span style={{ fg: theme.textMuted }}>{bar().empty}</span>
        <span style={{ fg: theme.text }}> {bar().label.padStart(4)}</span>
      </text>
      <text fg={theme.textMuted} wrapMode="none">
        {"    "}Reset at {reset()}
      </text>
    </box>
  )
}
