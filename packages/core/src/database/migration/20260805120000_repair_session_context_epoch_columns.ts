import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260805120000_repair_session_context_epoch_columns",
  up(tx) {
    return Effect.gen(function* () {
      const columns = yield* tx.all<{ name: string }>(`PRAGMA table_info(\`session_context_epoch\`)`)
      const names = new Set(columns.map((col) => col.name))
      if (!names.has("replacement_seq")) {
        yield* tx.run(`ALTER TABLE \`session_context_epoch\` ADD \`replacement_seq\` integer;`)
      }
      if (!names.has("revision")) {
        yield* tx.run(`ALTER TABLE \`session_context_epoch\` ADD \`revision\` integer DEFAULT 0 NOT NULL;`)
      }
    })
  },
} satisfies DatabaseMigration.Migration
