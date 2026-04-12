import { pgTable, text, serial, timestamp, date, integer, boolean, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const grievancesTable = pgTable("grievances", {
  id: serial("id").primaryKey(),
  grievanceNumber: text("grievance_number").notNull(),
  memberId: integer("member_id"),
  title: text("title").notNull(),
  description: text("description"),
  contractArticle: text("contract_article"),
  step: integer("step").notNull().default(1),
  status: text("status", {
    enum: ["open", "pending_response", "pending_hearing", "resolved", "withdrawn", "member_requested"],
  }).notNull().default("open"),
  filedDate: date("filed_date").notNull(),
  dueDate: date("due_date"),
  resolvedDate: date("resolved_date"),
  resolution: text("resolution"),
  notes: text("notes"),
  accommodationRequest: boolean("accommodation_request").notNull().default(false),
  grievanceType: varchar("grievance_type", { length: 30 }),
  incidentDate: date("incident_date"),
  remedyRequested: text("remedy_requested"),
  outcome: varchar("outcome", { length: 20 }).default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  memberIdIdx: index("grievances_member_id_idx").on(table.memberId),
  statusIdx: index("grievances_status_idx").on(table.status),
  createdAtIdx: index("grievances_created_at_idx").on(table.createdAt),
  dueDateIdx: index("grievances_due_date_idx").on(table.dueDate),
}));

export const insertGrievanceSchema = createInsertSchema(grievancesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateGrievanceSchema = insertGrievanceSchema.partial();

export type InsertGrievance = z.infer<typeof insertGrievanceSchema>;
export type UpdateGrievance = z.infer<typeof updateGrievanceSchema>;
export type Grievance = typeof grievancesTable.$inferSelect;
