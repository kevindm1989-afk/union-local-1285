import { pgTable, text, serial, timestamp, date, integer } from "drizzle-orm/pg-core";
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
    enum: ["open", "pending_response", "pending_hearing", "resolved", "withdrawn"],
  }).notNull().default("open"),
  filedDate: date("filed_date").notNull(),
  dueDate: date("due_date"),
  resolvedDate: date("resolved_date"),
  resolution: text("resolution"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGrievanceSchema = createInsertSchema(grievancesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateGrievanceSchema = insertGrievanceSchema.partial();

export type InsertGrievance = z.infer<typeof insertGrievanceSchema>;
export type UpdateGrievance = z.infer<typeof updateGrievanceSchema>;
export type Grievance = typeof grievancesTable.$inferSelect;
