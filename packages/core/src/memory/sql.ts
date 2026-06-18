import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core"

export type Scope = "global" | "projects" | "sessions"
export type MemoryType = "memory" | "checkpoint" | "progress" | "notes"

export const MemoryFtsTable = sqliteTable(
  "memory_fts",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    path: text().notNull().unique(),
    scope: text().$type<Scope>().notNull(),
    scope_id: text().notNull().default(""),
    type: text().$type<MemoryType>().notNull(),
    body: text().notNull(),
    fingerprint: text().notNull(),
    last_indexed_at: integer().notNull(),
  },
  (table) => [
    index("memory_fts_scope_idx").on(table.scope),
    index("memory_fts_scope_id_idx").on(table.scope_id),
    index("memory_fts_type_idx").on(table.type),
  ],
)

export const MemoryFtsConfig = {
  scoreFloorRatio: 0.15,
  defaultLimit: 10,
  snippetSize: 32,
}
