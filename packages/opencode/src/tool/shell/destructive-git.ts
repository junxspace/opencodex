import path from "path"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

export function sessionTouchedFiles(messages: SessionV1.WithParts[]) {
  const files = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "patch") continue
      for (const file of part.files) files.add(path.normalize(file))
    }
  }
  return files
}

export function scanDestructiveGit(input: {
  commands: string[][]
  touched: ReadonlySet<string>
  cwd: string
}) {
  const patterns = new Set<string>()
  for (const tokens of input.commands) {
    const hit = destructiveGitCommand(tokens, input.touched, input.cwd)
    if (hit) patterns.add(hit)
  }
  return Array.from(patterns)
}

export function destructiveGitCommand(tokens: string[], touched: ReadonlySet<string>, cwd: string) {
  if (tokens[0]?.toLowerCase() !== "git") return
  const sub = tokens[1]?.toLowerCase()
  if (!sub) return

  if (sub === "reset" && tokens.some((token) => token === "--hard")) return "git reset --hard"

  if (sub === "clean" && tokens.some((token) => token === "-f" || token === "--force" || /^-[^-]*f/.test(token))) {
    return "git clean"
  }

  if (sub === "restore") {
    const targets = gitPathspecs(tokens, 2, cwd)
    if (targets.some((target) => !isSessionTouched(target, touched))) return summarize(tokens)
    return
  }

  if (sub === "checkout") {
    if (tokens.some((token) => token === "--hard")) return "git checkout --hard"
    const sep = tokens.indexOf("--")
    if (sep < 0) return
    const targets = gitPathspecs(tokens, sep + 1, cwd)
    if (targets.some((target) => !isSessionTouched(target, touched))) return summarize(tokens)
    return
  }

  return
}

function isSessionTouched(target: string, touched: ReadonlySet<string>) {
  if (target === ".") return false
  return touched.has(target)
}

function gitPathspecs(tokens: string[], start: number, cwd: string) {
  return tokens
    .slice(start)
    .filter((token) => !token.startsWith("-"))
    .map((token) => (token === "." ? "." : path.normalize(path.resolve(cwd, token))))
}

function summarize(tokens: string[]) {
  return tokens.slice(0, Math.min(tokens.length, 8)).join(" ")
}

export * as DestructiveGit from "./destructive-git"
