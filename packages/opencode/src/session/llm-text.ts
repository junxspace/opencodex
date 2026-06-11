import { LLMEvent } from "@opencode-ai/llm"
import { Effect } from "effect"
import * as Stream from "effect/Stream"

export namespace LLMText {
  export function text(stream: Stream.Stream<LLMEvent, unknown>) {
    return stream.pipe(
      Stream.mapEffect((event) => {
        if (LLMEvent.is.providerError(event)) return Effect.fail(new Error(event.message))
        if (!LLMEvent.is.textDelta(event)) return Effect.succeed("")
        return Effect.succeed(event.text)
      }),
      Stream.mkString,
    )
  }
}
