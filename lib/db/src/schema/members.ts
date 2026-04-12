import { pgTable, text, serial, timestamp, date, boolean, varchar, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  employeeId: text("employee_id"),
  department: text("department"),
  classification: text("classification"),
  phone: text("phone"),
  email: text("email"),
  joinDate: date("join_date"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  seniorityDate: date("seniority_date"),
  duesStatus: varchar("dues_status", { length: 20 }).default("current"),
  duesLastPaid: date("dues_last_paid"),
  shift: varchar("shift", { length: 20 }),
  classificationDate: date("classification_date"),
  signatureData: text("signature_data"),
  signedAt: timestamp("signed_at"),
  engagementLevel: varchar("engagement_level", { length: 20 }).default("unknown"),
  shopFloorLeader: boolean("shop_floor_leader").notNull().default(false),
  organizingNotes: text("organizing_notes"),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  seniorityRank: integer("seniority_rank"),
  accommodationActive: boolean("accommodation_active").notNull().default(false),
  stewardNotes: text("steward_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  employeeIdIdx: index("members_employee_id_idx").on(table.employeeId),
  departmentIdx: index("members_department_idx").on(table.department),
  isActiveIdx: index("members_is_active_idx").on(table.isActive),
}));

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMemberSchema = insertMemberSchema.partial();

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type UpdateMember = z.infer<typeof updateMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
