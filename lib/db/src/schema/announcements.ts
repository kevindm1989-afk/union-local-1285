import { pgTable, text, serial, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category", {
    enum: ["general", "urgent", "contract", "meeting", "action", "safety_alert", "strike_action"],
  }).notNull().default("general"),
  isUrgent: boolean("is_urgent").notNull().default(false),
  urgencyLevel: varchar("urgency_level", { length: 20 }).notNull().default("normal"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAnnouncementSchema = insertAnnouncementSchema.partial();

export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type UpdateAnnouncement = z.infer<typeof updateAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;
