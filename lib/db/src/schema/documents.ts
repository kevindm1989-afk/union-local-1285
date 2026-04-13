import { pgTable, serial, varchar, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("cba"),
  description: text("description"),
  filename: varchar("filename", { length: 255 }).notNull(),
  objectPath: varchar("object_path", { length: 512 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull().default("application/pdf"),
  fileSize: varchar("file_size", { length: 50 }),
  isCurrent: boolean("is_current").notNull().default(true),
  effectiveDate: varchar("effective_date", { length: 20 }),
  expirationDate: varchar("expiration_date", { length: 20 }),
  notes: text("notes"),
  stewardOnly: boolean("steward_only").notNull().default(false),
  uploadedBy: integer("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Version control fields
  versionNumber: integer("version_number").notNull().default(1),
  changeNote: text("change_note"),
  documentGroupId: integer("document_group_id"),
});
