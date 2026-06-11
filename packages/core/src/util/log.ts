export * as Log from "./log"

import path from "path"
import fs from "fs/promises"
import { Global } from "../global"
import { Glob } from "./glob"

export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR"

const levelPriority: Record<Level, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

const keep = 10

let level: Level = "INFO"
let logpath = ""

function shouldLog(input: Level): boolean {
  return levelPriority[input] >= levelPriority[level]
}

export type Logger = {
  debug(message?: unknown, extra?: Record<string, unknown>): void
  info(message?: unknown, extra?: Record<string, unknown>): void
  error(message?: unknown, extra?: Record<string, unknown>): void
  warn(message?: unknown, extra?: Record<string, unknown>): void
  tag(key: string, value: string): Logger
  clone(): Logger
  time(
    message: string,
    extra?: Record<string, unknown>,
  ): {
    stop(): void
    [Symbol.dispose](): void
  }
}

const loggers = new Map<string, Logger>()

export const Default = create({ service: "default" })

export interface Options {
  print: boolean
  dev?: boolean
  level?: Level
}

export function file() {
  return logpath
}

let write = (msg: string) => {
  process.stderr.write(msg)
  return msg.length
}

export async function init(options: Options) {
  if (options.level) level = options.level
  if (options.print || process.env.OPENCODE_PRINT_LOGS === "1") return

  await cleanup(Global.Path.log)
  logpath = path.join(
    Global.Path.log,
    options.dev ? "dev.log" : new Date().toISOString().split(".")[0].replace(/:/g, "") + ".log",
  )
  await fs.mkdir(path.dirname(logpath), { recursive: true }).catch(() => {})
  await fs.appendFile(logpath, "", { flag: "a" }).catch(() => {})
  write = (msg: string) => {
    fs.appendFile(logpath, msg).catch(() => {})
    return msg.length
  }
}

async function cleanup(dir: string) {
  const files = (
    await Glob.scan("????-??-??T??????.log", {
      cwd: dir,
      absolute: false,
      include: "file",
    }).catch(() => [])
  )
    .filter((file) => path.basename(file) === file)
    .sort()
  if (files.length <= keep) return

  const doomed = files.slice(0, -keep)
  await Promise.all(doomed.map((file) => fs.unlink(path.join(dir, file)).catch(() => {})))
}

function formatError(error: Error, depth = 0): string {
  const result = error.message
  return error.cause instanceof Error && depth < 10
    ? result + " Caused by: " + formatError(error.cause, depth + 1)
    : result
}

let last = Date.now()

export function create(tags?: Record<string, unknown>) {
  tags = tags || {}

  const service = tags["service"]
  if (service && typeof service === "string") {
    const cached = loggers.get(service)
    if (cached) return cached
  }

  function build(message: unknown, extra?: Record<string, unknown>) {
    const prefix = Object.entries({
      ...tags,
      ...extra,
    })
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const prefix = `${key}=`
        if (value instanceof Error) return prefix + formatError(value)
        if (typeof value === "object") return prefix + JSON.stringify(value)
        return prefix + value
      })
      .join(" ")
    const next = new Date()
    const diff = next.getTime() - last
    last = next.getTime()
    return [next.toISOString().split(".")[0], "+" + diff + "ms", prefix, message].filter(Boolean).join(" ") + "\n"
  }

  const result: Logger = {
    debug(message?: unknown, extra?: Record<string, unknown>) {
      if (shouldLog("DEBUG")) write("DEBUG " + build(message, extra))
    },
    info(message?: unknown, extra?: Record<string, unknown>) {
      if (shouldLog("INFO")) write("INFO  " + build(message, extra))
    },
    error(message?: unknown, extra?: Record<string, unknown>) {
      if (shouldLog("ERROR")) write("ERROR " + build(message, extra))
    },
    warn(message?: unknown, extra?: Record<string, unknown>) {
      if (shouldLog("WARN")) write("WARN  " + build(message, extra))
    },
    tag(key: string, value: string) {
      if (tags) tags[key] = value
      return result
    },
    clone() {
      return create({ ...tags })
    },
    time(message: string, extra?: Record<string, unknown>) {
      const now = Date.now()
      result.info(message, { status: "started", ...extra })
      function stop() {
        result.info(message, {
          status: "completed",
          duration: Date.now() - now,
          ...extra,
        })
      }
      return {
        stop,
        [Symbol.dispose]() {
          stop()
        },
      }
    },
  }

  if (service && typeof service === "string") loggers.set(service, result)

  return result
}
