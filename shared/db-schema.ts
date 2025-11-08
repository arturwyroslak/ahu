import { pgTable, text, timestamp, integer, jsonb, boolean, serial, uuid, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  repository: text("repository").notNull(),
  branch: text("branch"),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  progress: integer("progress").notNull().default(0),
  eventId: uuid("event_id"),
}, (table) => ({
  statusIdx: index("status_idx").on(table.status),
  repoIdx: index("repo_idx").on(table.repository),
}));

export const taskLogs = pgTable("task_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  taskIdx: index("task_logs_task_idx").on(table.taskId),
}));

export const reasoningSteps = pgTable("reasoning_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  timestamp: text("timestamp").notNull(),
  description: text("description").notNull(),
  confidence: integer("confidence"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  taskIdx: index("reasoning_steps_task_idx").on(table.taskId),
}));

export const fileDiffs = pgTable("file_diffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  lines: jsonb("lines").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  taskIdx: index("file_diffs_task_idx").on(table.taskId),
}));

export const githubEvents = pgTable("github_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  type: text("type").notNull(),
  repository: text("repository").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload"),
  taskId: uuid("task_id"),
}, (table) => ({
  typeIdx: index("github_events_type_idx").on(table.type),
  repoIdx: index("github_events_repo_idx").on(table.repository),
  timestampIdx: index("github_events_timestamp_idx").on(table.timestamp),
}));

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  aiEndpoint: text("ai_endpoint").notNull(),
  aiKey: text("ai_key").notNull(),
  aiModel: text("ai_model").notNull(),
  aiMaxTokens: integer("ai_max_tokens").notNull().default(4096),
  aiTemperature: integer("ai_temperature").notNull().default(70),
  githubToken: text("github_token").notNull(),
  githubWebhookSecret: text("github_webhook_secret"),
  autoApprove: boolean("auto_approve").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const repositoryContexts = pgTable("repository_contexts", {
  id: uuid("id").primaryKey().defaultRandom(),
  repository: text("repository").notNull().unique(),
  architecture: jsonb("architecture"),
  dependencies: jsonb("dependencies"),
  fileStructure: jsonb("file_structure"),
  branches: jsonb("branches"),
  recentCommits: jsonb("recent_commits"),
  openIssues: jsonb("open_issues"),
  semanticSummary: text("semantic_summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  repoIdx: index("repo_contexts_repo_idx").on(table.repository),
}));

export const containerRunners = pgTable("container_runners", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  containerId: text("container_id"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  telemetry: jsonb("telemetry"),
  artifacts: jsonb("artifacts"),
}, (table) => ({
  taskIdx: index("container_runners_task_idx").on(table.taskId),
  statusIdx: index("container_runners_status_idx").on(table.status),
}));

export const mcpConnections = pgTable("mcp_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(),
  status: text("status").notNull(),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  typeIdx: index("mcp_connections_type_idx").on(table.type),
}));

export const tasksRelations = relations(tasks, ({ many, one }) => ({
  logs: many(taskLogs),
  reasoning: many(reasoningSteps),
  diffs: many(fileDiffs),
  runners: many(containerRunners),
  event: one(githubEvents, {
    fields: [tasks.eventId],
    references: [githubEvents.id],
  }),
}));

export const githubEventsRelations = relations(githubEvents, ({ one }) => ({
  task: one(tasks, {
    fields: [githubEvents.taskId],
    references: [tasks.id],
  }),
}));

export const taskLogsRelations = relations(taskLogs, ({ one }) => ({
  task: one(tasks, {
    fields: [taskLogs.taskId],
    references: [tasks.id],
  }),
}));

export const reasoningStepsRelations = relations(reasoningSteps, ({ one }) => ({
  task: one(tasks, {
    fields: [reasoningSteps.taskId],
    references: [tasks.id],
  }),
}));

export const fileDiffsRelations = relations(fileDiffs, ({ one }) => ({
  task: one(tasks, {
    fields: [fileDiffs.taskId],
    references: [tasks.id],
  }),
}));

export const containerRunnersRelations = relations(containerRunners, ({ one }) => ({
  task: one(tasks, {
    fields: [containerRunners.taskId],
    references: [tasks.id],
  }),
}));
