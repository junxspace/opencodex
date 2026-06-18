import type { Event } from "@opencode-ai/sdk/v2"
import type { TuiAttentionSoundName, TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"

const id = "internal:notifications"

type SessionError = Extract<Event, { type: "session.error" }>["properties"]["error"]

function routeSessionID(api: TuiPluginApi) {
  const current = api.route.current
  if (current.name !== "session") return
  if (!("params" in current) || !current.params) return
  if (typeof current.params.sessionID !== "string") return
  return current.params.sessionID
}

function viewing(api: TuiPluginApi, sessionID: string) {
  return routeSessionID(api) === sessionID
}

function relevant(api: TuiPluginApi, sessionID: string, active: ReadonlySet<string>) {
  return active.has(sessionID) || viewing(api, sessionID)
}

function notify(api: TuiPluginApi, sessionID: string | undefined, message: string, sound: TuiAttentionSoundName) {
  const session = sessionID ? api.state.session.get(sessionID) : undefined
  const isSubagent = session?.parentID !== undefined
  void api.attention.notify({
    title: session?.title,
    message,
    notification: isSubagent ? false : { when: "blurred" },
    sound: { name: sound, when: "always" },
  })
}

function sessionErrorMessage(error: SessionError) {
  if (error?.name === "MessageAbortedError") return "Session aborted"
  const data = error?.data
  if (data && typeof data === "object" && "message" in data && data.message === "SSE read timed out") {
    return "Model stopped responding"
  }
  return "Session error"
}

const tui: TuiPlugin = async (api) => {
  const active = new Set<string>()
  const errored = new Set<string>()
  const questions = new Set<string>()
  const permissions = new Set<string>()

  api.event.on("question.asked", (event) => {
    if (questions.has(event.properties.id)) return
    if (!relevant(api, event.properties.sessionID, active)) return
    questions.add(event.properties.id)
    notify(api, event.properties.sessionID, "Question needs input", "question")
  })

  api.event.on("question.replied", (event) => {
    questions.delete(event.properties.requestID)
  })

  api.event.on("question.rejected", (event) => {
    questions.delete(event.properties.requestID)
  })

  api.event.on("permission.asked", (event) => {
    if (permissions.has(event.properties.id)) return
    if (!relevant(api, event.properties.sessionID, active)) return
    permissions.add(event.properties.id)
    notify(api, event.properties.sessionID, "Permission needs input", "permission")
  })

  api.event.on("permission.replied", (event) => {
    permissions.delete(event.properties.requestID)
  })

  api.event.on("session.status", (event) => {
    const sessionID = event.properties.sessionID
    if (event.properties.status.type === "busy" || event.properties.status.type === "retry") {
      if (viewing(api, sessionID)) active.add(sessionID)
      errored.delete(sessionID)
      return
    }

    if (event.properties.status.type !== "idle") return
    if (!active.has(sessionID)) return
    active.delete(sessionID)

    if (errored.has(sessionID)) {
      errored.delete(sessionID)
      return
    }

    const session = api.state.session.get(sessionID)
    notify(api, sessionID, "Session done", session?.parentID ? "subagent_done" : "done")
  })

  api.event.on("session.error", (event) => {
    const sessionID = event.properties.sessionID
    if (!sessionID) return
    if (!active.has(sessionID)) return
    errored.add(sessionID)
    notify(api, sessionID, sessionErrorMessage(event.properties.error), "error")
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
