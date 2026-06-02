import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { users } from "./users";

/**
 * SESSIONS
 * Server-side session store. sessionTokenHash stores the hash of the
 * cookie token; raw token never persisted.
 * Note: Lucia v3 typically uses its own adapter; we keep this table
 * for cases where Lucia's adapter is bypassed (e.g. admin tooling).
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => ({
    idxUser: index("idx_sessions_user").on(t.userId),
    idxExpires: index("idx_sessions_expires").on(t.expiresAt),
  })
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
