import path from "path"
import fs from "fs/promises"
import { Effect, Context, Layer } from "effect"
import { sql, eq } from "drizzle-orm"
import { Database } from "../database/database"
import { Flag } from "../flag/flag"
import { MemoryFtsTable, MemoryFtsConfig, type Scope, type MemoryType } from "./sql"
import * as SearchConfig from "./search-config"
import * as Paths from "./paths"

export interface SearchResult {
  path: string
  scope: Scope
  scopeId: string
  type: MemoryType
  snippet: string
  score: number
}

export interface SearchArgs {
  query: string
  scope?: Scope
  scopeId?: string
  type?: MemoryType
  limit?: number
}

export interface IndexEntry {
  path: string
  scope: Scope
  scopeId: string
  type: MemoryType
  body: string
  fingerprint: string
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Memory") {}

let startupReconcileStarted = false

export interface Interface {
  search: (args: SearchArgs) => Effect.Effect<SearchResult[], unknown>
  index: (entry: IndexEntry) => Effect.Effect<void, unknown>
  remove: (path: string) => Effect.Effect<void, unknown>
  reconcile: () => Effect.Effect<void, unknown>
  get: (path: string) => Effect.Effect<IndexEntry | undefined, unknown>
  readBody: (path: string) => Effect.Effect<string, unknown>
  writeBody: (path: string, body: string) => Effect.Effect<void, unknown>
}

function queryTerms(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return [] as string[]

  const tokens = trimmed
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (tokens.length > 0) return tokens

  return [trimmed.replace(/\s+/g, "")]
}

function buildFtsQuery(input: string): string {
  const tokens = queryTerms(input)
  if (tokens.length === 0) return ""
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ")
}

function snippetFromBody(body: string, query: string) {
  const terms = queryTerms(query)
  const lower = body.toLowerCase()
  const match = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  const start = match === undefined ? 0 : Math.max(0, match - 12)
  const maxChars = MemoryFtsConfig.snippetSize * 4
  const excerpt = body.slice(start, start + maxChars).trim()
  if (!excerpt) return ""
  const prefix = start > 0 ? "..." : ""
  const suffix = start + maxChars < body.length ? "..." : ""
  return `${prefix}${excerpt}${suffix}`
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const search = Effect.fn("Memory.search")(function* (args: SearchArgs) {
      const limit = args.limit ?? MemoryFtsConfig.defaultLimit
      const ftsQuery = buildFtsQuery(args.query)
      if (!ftsQuery) return [] as SearchResult[]

      const conditions: string[] = []
      if (args.scope) {
        conditions.push(`memory_fts.scope = '${args.scope}'`)
      }
      if (args.scopeId) {
        conditions.push(`memory_fts.scope_id = '${args.scopeId}'`)
      }
      if (args.type) {
        conditions.push(`memory_fts.type = '${args.type}'`)
      }
      const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : ""
      const fetchLimit = Math.min(limit * 3, 50)

      const excerptChars = MemoryFtsConfig.snippetSize * 16
      const querySql = `
        SELECT memory_fts.path, memory_fts.scope, memory_fts.scope_id, memory_fts.type,
               substr(memory_fts.body, 1, ${excerptChars}) AS body_excerpt,
               bm25(memory_fts_idx) AS score
        FROM memory_fts_idx
        JOIN memory_fts ON memory_fts.id = memory_fts_idx.rowid
        WHERE memory_fts_idx MATCH '${ftsQuery.replace(/'/g, "''")}' ${whereClause}
        ORDER BY score
        LIMIT ${fetchLimit}
      `

      const rows = yield* db.all<{
        path: string
        scope: Scope
        scope_id: string
        type: MemoryType
        body_excerpt: string
        score: number
      }>(sql.raw(querySql))

      const mapped = rows.map((r) => ({
        path: r.path,
        scope: r.scope,
        scopeId: r.scope_id,
        type: r.type,
        snippet: snippetFromBody(r.body_excerpt, args.query),
        score: -r.score,
      }))

      if (mapped.length === 0) return [] as SearchResult[]

      const topScore = mapped[0].score
      const cutoff = SearchConfig.scoreFloorRatio > 0 ? topScore * SearchConfig.scoreFloorRatio : -Infinity
      return mapped.filter((r, i) => i === 0 || r.score >= cutoff).slice(0, limit)
    })

    const index = Effect.fn("Memory.index")(function* (entry: IndexEntry) {
      yield* db
        .insert(MemoryFtsTable)
        .values({
          path: entry.path,
          scope: entry.scope,
          scope_id: entry.scopeId,
          type: entry.type,
          body: entry.body,
          fingerprint: entry.fingerprint,
          last_indexed_at: Date.now(),
        })
        .onConflictDoUpdate({
          target: MemoryFtsTable.path,
          set: {
            scope: entry.scope,
            scope_id: entry.scopeId,
            type: entry.type,
            body: entry.body,
            fingerprint: entry.fingerprint,
            last_indexed_at: Date.now(),
          },
        })
        .run()
    })

    const remove = Effect.fn("Memory.remove")(function* (filePath: string) {
      yield* db.delete(MemoryFtsTable).where(eq(MemoryFtsTable.path, filePath)).run()
    })

    const get = Effect.fn("Memory.get")(function* (filePath: string) {
      const rows = yield* db.select().from(MemoryFtsTable).where(eq(MemoryFtsTable.path, filePath)).all()
      const row = rows[0]
      if (!row) return undefined
      return {
        path: row.path,
        scope: row.scope,
        scopeId: row.scope_id,
        type: row.type,
        body: row.body,
        fingerprint: row.fingerprint,
      }
    })

    const readBody = Effect.fn("Memory.readBody")(function* (filePath: string) {
      const content = yield* Effect.tryPromise(() => fs.readFile(filePath, "utf-8"))
      return content
    })

    const writeBody = Effect.fn("Memory.writeBody")(function* (filePath: string, body: string) {
      yield* Effect.tryPromise(() => fs.mkdir(path.dirname(filePath), { recursive: true }))
      yield* Effect.tryPromise(() => fs.writeFile(filePath, body, "utf-8"))
    })

    const reconcile = Effect.fn("Memory.reconcile")(function* () {
      const memoryRoot = Paths.root()

      const walkDir = async (dir: string): Promise<string[]> => {
        const files: string[] = []
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              files.push(...(await walkDir(fullPath)))
            } else if (entry.name.endsWith(".md")) {
              files.push(fullPath)
            }
          }
        } catch {}
        return files
      }

      const diskFiles = new Set<string>()

      const globalDir = path.join(memoryRoot, "global")
      const globalFiles = yield* Effect.tryPromise(() => walkDir(globalDir))
      globalFiles.forEach((f) => diskFiles.add(f))

      const projectsDir = path.join(memoryRoot, "projects")
      const projectDirs = yield* Effect.tryPromise(() => fs.readdir(projectsDir, { withFileTypes: true }).catch(() => []))
      for (const projDir of projectDirs) {
        if (projDir.isDirectory()) {
          const projFiles = yield* Effect.tryPromise(() => walkDir(path.join(projectsDir, projDir.name)))
          projFiles.forEach((f) => diskFiles.add(f))
        }
      }

      const sessionsDir = path.join(memoryRoot, "sessions")
      const sessionDirs = yield* Effect.tryPromise(() => fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []))
      for (const sessDir of sessionDirs) {
        if (sessDir.isDirectory()) {
          const sessFiles = yield* Effect.tryPromise(() => walkDir(path.join(sessionsDir, sessDir.name)))
          sessFiles.forEach((f) => diskFiles.add(f))
        }
      }

      const indexedRows = yield* db.select().from(MemoryFtsTable).all()
      const indexedPaths = new Map(indexedRows.map((r) => [r.path, r]))

      for (const [indexPath] of indexedPaths) {
        if (!diskFiles.has(indexPath)) {
          yield* db.delete(MemoryFtsTable).where(eq(MemoryFtsTable.path, indexPath)).run()
        }
      }

      for (const diskPath of diskFiles) {
        const existing = indexedPaths.get(diskPath)
        const stat = yield* Effect.tryPromise(() => fs.stat(diskPath))
        const fingerprint = `${stat.size}-${stat.mtimeMs}`

        if (!existing || existing.fingerprint !== fingerprint) {
          const body = yield* readBody(diskPath)
          const parsed = Paths.parsePath(diskPath)
          if (parsed) {
            yield* index({
              path: diskPath,
              scope: parsed.scope as Scope,
              scopeId: parsed.scopeId,
              type: parsed.type as MemoryType,
              body,
              fingerprint,
            })
          }
        }
      }
    })

    const service = Service.of({ search, index, remove, reconcile, get, readBody, writeBody })

    if (Flag.OPENCODE_DB !== ":memory:" && !startupReconcileStarted) {
      startupReconcileStarted = true
      yield* reconcile().pipe(
        Effect.catchCause((cause) => {
          startupReconcileStarted = false
          return Effect.logWarning("memory reconcile failed at startup", { cause })
        }),
        Effect.forkScoped,
      )
    }

    return service
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Database.defaultLayer))
