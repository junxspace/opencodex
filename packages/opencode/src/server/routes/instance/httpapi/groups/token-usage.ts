import { ProviderV2 } from "@opencode-ai/core/provider"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import { TokenUsage } from "@/token-usage/token-usage"

const root = "/token-usage"

const TokenUsageProviderParam = Schema.Struct({
  providerID: ProviderV2.ID,
})

export const TokenUsageApi = HttpApi.make("token-usage")
  .add(
    HttpApiGroup.make("token-usage")
      .add(
        HttpApiEndpoint.get("get", `${root}/:providerID`, {
          params: TokenUsageProviderParam,
          query: WorkspaceRoutingQuery,
          success: described(Schema.NullOr(TokenUsage.Usage), "Token usage for the requested provider"),
          error: HttpApiError.InternalServerError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "tokenUsage.get",
            summary: "Get token usage",
            description:
              "Return the most recent cached token-usage snapshot for the given provider. Returns null when no adapter is configured.",
          }),
        ),
        HttpApiEndpoint.post("refresh", `${root}/:providerID/refresh`, {
          params: TokenUsageProviderParam,
          query: WorkspaceRoutingQuery,
          success: described(Schema.NullOr(TokenUsage.Usage), "Refreshed token usage"),
          error: HttpApiError.InternalServerError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "tokenUsage.refresh",
            summary: "Refresh token usage",
            description:
              "Force a refresh of the cached token-usage snapshot for the given provider by re-running its configured adapter command.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "token-usage",
          description: "Token usage routes backed by user-configured provider adapters.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode token-usage HttpApi",
      version: "0.0.1",
      description: "Token usage HttpApi surface for selected instance routes.",
    }),
  )
