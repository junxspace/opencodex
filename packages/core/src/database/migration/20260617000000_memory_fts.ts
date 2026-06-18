import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260617000000_memory_fts",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`memory_fts\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          \`path\` text NOT NULL UNIQUE,
          \`scope\` text NOT NULL,
          \`scope_id\` text NOT NULL DEFAULT '',
          \`type\` text NOT NULL,
          \`body\` text NOT NULL,
          \`fingerprint\` text NOT NULL,
          \`last_indexed_at\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS \`memory_fts_scope_idx\` ON \`memory_fts\` (\`scope\`);`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS \`memory_fts_scope_id_idx\` ON \`memory_fts\` (\`scope_id\`);`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS \`memory_fts_type_idx\` ON \`memory_fts\` (\`type\`);`)
      yield* tx.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS \`memory_fts_idx\` USING fts5(
          body,
          content='memory_fts',
          content_rowid='id',
          tokenize='porter unicode61'
        );
      `)
      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS \`memory_fts_insert\` AFTER INSERT ON \`memory_fts\` BEGIN
          INSERT INTO \`memory_fts_idx\`(\`rowid\`, \`body\`) VALUES (new.\`id\`, new.\`body\`);
        END;
      `)
      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS \`memory_fts_delete\` AFTER DELETE ON \`memory_fts\` BEGIN
          INSERT INTO \`memory_fts_idx\`(\`memory_fts_idx\`, \`rowid\`, \`body\`) VALUES('delete', old.\`id\`, old.\`body\`);
        END;
      `)
      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS \`memory_fts_update\` AFTER UPDATE ON \`memory_fts\` BEGIN
          INSERT INTO \`memory_fts_idx\`(\`memory_fts_idx\`, \`rowid\`, \`body\`) VALUES('delete', old.\`id\`, old.\`body\`);
          INSERT INTO \`memory_fts_idx\`(\`rowid\`, \`body\`) VALUES (new.\`id\`, new.\`body\`);
        END;
      `)
    })
  },
} satisfies DatabaseMigration.Migration
