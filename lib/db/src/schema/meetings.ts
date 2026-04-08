import { pgTable, serial, text, varchar, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: varchar("type", { length: 30 }).notNull().default("general"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  location: text("location"),
  agenda: text("agenda"),
  minutes: text("minutes"),
  minutesPublished: varchar("minutes_published", { length: 10 }).default("draft"),
  attendees: jsonb("attendees").$type<number[]>().default([]),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Meeting = typeof meetingsTable.$inferSelect;
export type InsertMeeting = typeof meetingsTable.$inferInsert;
