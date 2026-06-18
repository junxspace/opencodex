import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js"
import { formatDurationMs } from "@opencode-ai/core/util/duration"

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) timer = setInterval(() => listeners.forEach((item) => item()), 100)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useLiveDuration(
  start: Accessor<number | undefined>,
  end: Accessor<number | undefined>,
  active: Accessor<boolean>,
) {
  const [now, setNow] = createSignal(Date.now())

  createEffect(() => {
    if (!start()) return
    if (!active() && end() !== undefined) return
    let live = true
    const stop = subscribe(() => {
      if (live) setNow(Date.now())
    })
    onCleanup(() => {
      live = false
      stop()
    })
  })

  return createMemo(() => {
    const started = start()
    if (!started) return ""
    const ended = end()
    const ms = ended !== undefined ? ended - started : active() ? now() - started : 0
    return formatDurationMs(ms)
  })
}

export function useBusySince(busy: Accessor<boolean>) {
  const [since, setSince] = createSignal<number | undefined>()

  createEffect(
    on(busy, (active) => {
      if (active) {
        setSince((value) => value ?? Date.now())
        return
      }
      setSince(undefined)
    }),
  )

  return since
}
