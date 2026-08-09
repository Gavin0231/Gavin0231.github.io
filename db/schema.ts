import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  defaultBudgetMinutes: integer("default_budget_minutes").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  color: text("color").notNull().default("#52647D"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  budgetMinutes: integer("budget_minutes").notNull(),
  progressPercent: integer("progress_percent").notNull().default(0),
  notes: text("notes").notNull().default(""),
  isArchived: integer("is_archived").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const timeSessions = sqliteTable("time_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  effectiveSeconds: integer("effective_seconds").notNull(),
  pauseSeconds: integer("pause_seconds").notNull().default(0),
  notes: text("notes").notNull().default(""),
  isManualAdjusted: integer("is_manual_adjusted").notNull().default(0),
  isDeleted: integer("is_deleted").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const activeTimer = sqliteTable("active_timer", {
  id: integer("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  state: text("state").notNull(),
  startedAt: text("started_at").notNull(),
  lastResumedAt: text("last_resumed_at"),
  pausedAt: text("paused_at"),
  accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
  accumulatedPauseSeconds: integer("accumulated_pause_seconds").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});
