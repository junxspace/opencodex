import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core"

export const TelemetryTable = sqliteTable(
  "telemetry",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    event: text().notNull(),
    distinct_id: text(),
    properties: text({ mode: "json" }).$type<Record<string, unknown>>(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("telemetry_event_idx").on(table.event),
    index("telemetry_time_created_idx").on(table.time_created),
  ],
)
