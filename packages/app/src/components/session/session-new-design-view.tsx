import type { JSX } from "solid-js"
import { WordmarkV2 } from "@opencode-ai/ui/v2/wordmark-v2"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep">
      <div class="absolute inset-x-0 top-[10%] flex justify-center px-3 sm:top-[18%] sm:px-4 lg:top-[25.375%] lg:px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <WordmarkV2 class="h-auto w-full max-h-[min(28vw,120px)] text-v2-icon-icon-base sm:max-h-none" />
          <div class="mt-4 sm:mt-6 lg:mt-8">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
