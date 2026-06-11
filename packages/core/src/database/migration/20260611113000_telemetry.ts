import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260611113000_telemetry",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`telemetry\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          \`event\` text NOT NULL,
          \`distinct_id\` text,
          \`properties\` text,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`telemetry_event_idx\` ON \`telemetry\` (\`event\`);`)
      yield* tx.run(`CREATE INDEX \`telemetry_time_created_idx\` ON \`telemetry\` (\`time_created\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
