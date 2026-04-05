import { pgTable, text, serial, timestamp, date, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMemberSchema = insertMemberSchema.partial();

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type UpdateMember = z.infer<typeof updateMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
