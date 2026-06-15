import { createSignal, type Setter } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { readJson, writeJsonAtomic } from "../util/persistence"
import { useTuiPaths } from "./runtime"
import path from "path"
import { existsSync, readFileSync } from "node:fs"

function readKvFile(file: string) {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
  } catch (error) {
    console.error("Failed to read KV state", { error, file })
    return {}
  }
}

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const paths = useTuiPaths()
    void Global.Path.state
    const file = path.join(paths.state, "kv.json")
    const lock = `tui-kv:${file}`
    const [ready, setReady] = createSignal(true)
    const [store, setStore] = createStore<Record<string, any>>(readKvFile(file))
    // Queue same-process writes so rapid updates persist in order.
    let write = Promise.resolve()

    Flock.withLock(lock, () => readJson<Record<string, unknown>>(file))
      .then((x) => {
        setStore(x)
      })
      .catch((error) => {
        console.error("Failed to refresh KV state", { error })
      })
      .finally(() => {
        setReady(true)
      })

    const result = {
      get ready() {
        return ready()
      },
      get store() {
        return store
      },
      signal<T>(name: string, defaultValue: T) {
        if (store[name] === undefined) setStore(name, defaultValue)
        return [
          function () {
            return result.get(name)
          },
          function setter(next: Setter<T>) {
            result.set(name, next)
          },
        ] as const
      },
      get(key: string, defaultValue?: any) {
        return store[key] ?? defaultValue
      },
      set(key: string, value: any) {
        setStore(key, value)
        const snapshot = structuredClone(unwrap(store))
        write = write
          .then(() => Flock.withLock(lock, () => writeJsonAtomic(file, snapshot)))
          .catch((error) => {
            console.error("Failed to write KV state", { error })
          })
      },
    }
    return result
  },
})
