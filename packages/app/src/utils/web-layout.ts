import { createMediaQuery } from "@solid-primitives/media"
import { createMemo } from "solid-js"
import { usePlatform } from "@/context/platform"

export function useWebLayout() {
  const platform = usePlatform()
  const isWeb = createMemo(() => platform.platform === "web")
  const wide = createMediaQuery("(min-width: 1024px)")
  const compact = createMemo(() => isWeb() && !wide())
  const sessionDesktop = createMediaQuery("(min-width: 768px)")

  return {
    isWeb,
    compact,
    wide,
    sessionDesktop,
  }
}
