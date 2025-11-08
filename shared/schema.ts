import { z } from "zod";

// Task status types
export const taskStatusSchema = z.enum(["planning", "executing", "completed", "failed", "queued"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

// AI Reasoning Step
export const reasoningStepSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(100).optional(),
  completed: z.boolean(),
});

export type ReasoningStep = z.infer<typeof reasoningStepSchema>;

// Execution Log Entry
export const logLevelSchema = z.enum(["info", "warn", "error", "success"]);

export const logEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: logLevelSchema,
  message: z.string(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

// Code Diff
export const diffLineSchema = z.object({
  lineNumber: z.number(),
  type: z.enum(["add", "remove", "context"]),
  content: z.string(),
});

export const fileDiffSchema = z.object({
  path: z.string(),
  lines: z.array(diffLineSchema),
});

export type DiffLine = z.infer<typeof diffLineSchema>;
export type FileDiff = z.infer<typeof fileDiffSchema>;

// Task
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  repository: z.string(),
  branch: z.string().optional(),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  progress: z.number().min(0).max(100).default(0),
  logs: z.array(logEntrySchema).default([]),
  reasoning: z.array(reasoningStepSchema).default([]),
  diffs: z.array(fileDiffSchema).default([]),
  eventId: z.string().optional(),
});

export const insertTaskSchema = taskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  logs: true,
  reasoning: true,
  diffs: true,
});

export type Task = z.infer<typeof taskSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// GitHub Event
export const eventTypeSchema = z.enum(["pull_request", "push", "issue", "comment"]);
export const eventStatusSchema = z.enum(["success", "pending", "failed"]);

export const githubEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: eventTypeSchema,
  repository: z.string(),
  action: z.string(),
  status: eventStatusSchema,
  payload: z.record(z.any()).optional(),
  taskId: z.string().optional(),
});

export const insertGithubEventSchema = githubEventSchema.omit({
  id: true,
  timestamp: true,
});

export type GithubEvent = z.infer<typeof githubEventSchema>;
export type InsertGithubEvent = z.infer<typeof insertGithubEventSchema>;

// Settings
export const aiSettingsSchema = z.object({
  apiEndpoint: z.string().url(),
  apiKey: z.string(),
  model: z.string(),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});

export const githubSettingsSchema = z.object({
  token: z.string(),
  webhookSecret: z.string().optional(),
});

export const settingsSchema = z.object({
  ai: aiSettingsSchema,
  github: githubSettingsSchema,
  autoApprove: z.boolean().default(false),
});

export type AISettings = z.infer<typeof aiSettingsSchema>;
export type GithubSettings = z.infer<typeof githubSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;
