import { pgTable, text, serial, timestamp, date, boolean, varchar, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memberComplaintsTable = pgTable("member_complaints", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id"),
  submittedByUserId: integer("submitted_by_user_id"),
  description: text("description").notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  occurredDate: date("occurred_date").notNull(),
  affectedScope: varchar("affected_scope", { length: 30 }).notNull(),
  severity: varchar("severity", { length: 30 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  linkedGrievanceId: integer("linked_grievance_id"),
  aiCategory: varchar("ai_category", { length: 30 }),
  aiRecommendation: varchar("ai_recommendation", { length: 50 }),
  aiExplanation: text("ai_explanation"),
  aiPatternFlag: boolean("ai_pattern_flag").default(false),
  stewardNotes: text("steward_notes"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  memberIdx: index("member_complaints_member_id_idx").on(t.memberId),
  categoryIdx: index("member_complaints_category_idx").on(t.category),
  statusIdx: index("member_complaints_status_idx").on(t.status),
  createdAtIdx: index("member_complaints_created_at_idx").on(t.createdAt),
}));

export const insertComplaintSchema = createInsertSchema(memberComplaintsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  aiCategory: true,
  aiRecommendation: true,
  aiExplanation: true,
  aiPatternFlag: true,
  resolvedAt: true,
});

export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type MemberComplaint = typeof memberComplaintsTable.$inferSelect;
