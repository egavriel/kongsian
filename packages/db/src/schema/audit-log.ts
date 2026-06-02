import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * AUDIT_LOG
 * Append-only log of all write actions. before_json / after_json capture snapshots
 * (JSON-stringified). entity_type+entity_id composite index for entity history.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxEntity: index("idx_audit_entity").on(t.entityType, t.entityId),
    idxUser: index("idx_audit_user").on(t.userId),
    idxAction: index("idx_audit_action").on(t.action),
    idxCreated: index("idx_audit_created").on(t.createdAt),
  })
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
