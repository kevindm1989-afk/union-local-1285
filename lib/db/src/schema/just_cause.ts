import { pgTable, serial, integer, boolean, text, timestamp, index } from "drizzle-orm/pg-core";

export const justCauseAssessmentsTable = pgTable("just_cause_assessments", {
  id: serial("id").primaryKey(),
  grievanceId: integer("grievance_id").notNull().unique(),
  assessedBy: integer("assessed_by").notNull(),
  assessedAt: timestamp("assessed_at").notNull().defaultNow(),
  adequateNotice: boolean("adequate_notice").notNull().default(false),
  reasonableRule: boolean("reasonable_rule").notNull().default(false),
  investigationConducted: boolean("investigation_conducted").notNull().default(false),
  investigationFair: boolean("investigation_fair").notNull().default(false),
  proofSufficient: boolean("proof_sufficient").notNull().default(false),
  penaltyConsistent: boolean("penalty_consistent").notNull().default(false),
  penaltyProgressive: boolean("penalty_progressive").notNull().default(false),
  notes: text("notes"),
}, (table) => ({
  grievanceIdIdx: index("just_cause_grievance_id_idx").on(table.grievanceId),
}));

export type JustCauseAssessment = typeof justCauseAssessmentsTable.$inferSelect;
