import { TokenUsage } from "@/token-usage/token-usage"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const tokenUsageHandlers = HttpApiBuilder.group(InstanceHttpApi, "token-usage", (handlers) =>
  Effect.gen(function* () {
    const usage = yield* TokenUsage.Service

    const get = Effect.fn("TokenUsageHttpApi.get")(function* (ctx: { params: { providerID: string } }) {
      const result = yield* usage
        .get(ctx.params.providerID as never)
        .pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))
      return result ?? null
    })

    const refresh = Effect.fn("TokenUsageHttpApi.refresh")(function* (ctx: { params: { providerID: string } }) {
      const result = yield* usage
        .refresh(ctx.params.providerID as never)
        .pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))
      return result ?? null
    })

    return handlers.handle("get", get).handle("refresh", refresh)
  }),
)
