import type { FileChange, GitContext } from "./types"

const LOCK_FILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "shrinkwrap.yaml",
  "bun.lockb",
  "bun.lock",
  ".pnp.js",
  ".pnp.cjs",
  "jspm.lock",
  "Pipfile.lock",
  "poetry.lock",
  "pdm.lock",
  ".pdm-lock.toml",
  "uv.lock",
  "conda-lock.yml",
  "pylock.toml",
  "Gemfile.lock",
  "composer.lock",
  "gradle.lockfile",
  "lockfile.json",
  "dependency-lock.json",
  "dependency-reduced-pom.xml",
  "coursier.lock",
  "build.sbt.lock",
  "packages.lock.json",
  "paket.lock",
  "project.assets.json",
  "Cargo.lock",
  "go.sum",
  "Gopkg.lock",
  "glide.lock",
  "build.zig.zon.lock",
  "dune.lock",
  "opam.lock",
  "Package.resolved",
  "Podfile.lock",
  "Cartfile.resolved",
  "pubspec.lock",
  "mix.lock",
  "rebar.lock",
  "stack.yaml.lock",
  "cabal.project.freeze",
  "exact-dependencies.json",
  "shard.lock",
  "Manifest.toml",
  "JuliaManifest.toml",
  "renv.lock",
  "packrat.lock",
  "nimble.lock",
  "dub.selections.json",
  "rocks.lock",
  "carton.lock",
  "cpanfile.snapshot",
  "conan.lock",
  "vcpkg-lock.json",
  ".terraform.lock.hcl",
  "Berksfile.lock",
  "Puppetfile.lock",
  "MODULE.bazel.lock",
  "flake.lock",
  "deno.lock",
  "devcontainer.lock.json",
])

export const MAX_DIFF_LENGTH = 4000
export const MAX_TOTAL_DIFF_LENGTH = 48_000
const TRUNCATED_SUFFIX = "\n... [truncated]"

function truncateDiff(diff: string, max: number) {
  if (diff.length <= max) return diff
  const keep = Math.max(0, max - TRUNCATED_SUFFIX.length)
  return keep > 0 ? diff.slice(0, keep) + TRUNCATED_SUFFIX : diff.slice(0, max)
}

export function isLockFile(filepath: string) {
  const name = filepath.split("/").pop() ?? filepath
  return LOCK_FILES.has(name)
}

export function git(args: string[], cwd: string) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  })
  return result.stdout.toString().trimEnd()
}

export function parsePorcelainPath(raw: string) {
  const arrow = raw.indexOf(" -> ")
  if (arrow === -1) return { path: raw, paths: [raw] }
  const oldPath = raw.slice(0, arrow)
  const newPath = raw.slice(arrow + 4)
  return { path: newPath, paths: [oldPath, newPath] }
}

export function pathsForGitAdd(files: string[]) {
  return [...new Set(files.flatMap((file) => parsePorcelainPath(file).paths))]
}

export function parseNameStatus(output: string) {
  if (!output) return []
  return output.split("\n").map((line) => {
    const [status, ...rest] = line.split("\t")
    let path: string
    if (status!.startsWith("R")) {
      path = rest[1] ?? rest[0] ?? ""
    } else {
      path = rest.join("\t")
    }
    return { status: status!, path }
  })
}

export function parsePorcelain(output: string) {
  if (!output) return []
  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const xy = line.slice(0, 2)
      const { path } = parsePorcelainPath(line.slice(3))
      return { status: xy.trim(), path }
    })
}

export function mapStatus(code: string): FileChange["status"] {
  if (code.startsWith("R")) return "renamed"
  if (code === "A" || code === "??" || code === "?") return "added"
  if (code === "D") return "deleted"
  if (code === "M") return "modified"
  return "modified"
}

export function isUntracked(code: string) {
  return code === "??" || code === "?"
}

export async function getGitContext(repoPath: string, selectedFiles?: string[]): Promise<GitContext> {
  const branch = git(["branch", "--show-current"], repoPath) || "HEAD"
  const log = git(["log", "--oneline", "-5"], repoPath)
  const recentCommits = log ? log.split("\n") : []

  const staged = parseNameStatus(git(["diff", "--name-status", "--cached"], repoPath))
  const useStaged = staged.length > 0
  const raw = useStaged ? staged : parsePorcelain(git(["status", "--porcelain"], repoPath))
  const selected = selectedFiles ? new Set(selectedFiles) : undefined

  const files: FileChange[] = []
  let remainingDiff = MAX_TOTAL_DIFF_LENGTH
  for (const entry of raw) {
    if (isLockFile(entry.path)) continue
    if (selected && !selected.has(entry.path)) continue

    const status = mapStatus(entry.status)
    const untracked = isUntracked(entry.status)

    let diff: string
    if (untracked) {
      diff = `New untracked file: ${entry.path}`
    } else if (status === "deleted") {
      diff = useStaged
        ? git(["diff", "--cached", "--", entry.path], repoPath)
        : git(["diff", "--", entry.path], repoPath)
    } else {
      const rawDiff = useStaged
        ? git(["diff", "--cached", "--", entry.path], repoPath)
        : git(["diff", "--", entry.path], repoPath)

      if (rawDiff.includes("Binary files") || rawDiff.includes("GIT binary patch")) {
        diff = `Binary file ${entry.path} has been modified`
      } else {
        diff = rawDiff
      }
    }

    diff = truncateDiff(diff, MAX_DIFF_LENGTH)

    if (remainingDiff <= 0) {
      diff = ""
    } else if (diff.length > remainingDiff) {
      diff = truncateDiff(diff, remainingDiff)
      remainingDiff = 0
    } else {
      remainingDiff -= diff.length
    }

    files.push({ status, path: entry.path, diff })
  }

  return { branch, recentCommits, files }
}
