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

// AI Provider Types
export const providerTypeSchema = z.enum(["openai", "anthropic", "azure-openai"]);
export type ProviderType = z.infer<typeof providerTypeSchema>;

// Provider Configuration
export const providerConfigSchema = z.object({
  name: z.string(),
  type: providerTypeSchema,
  apiKey: z.string(),
  endpoint: z.string().url().optional(),
  model: z.string(),
  maxTokens: z.number().default(128000),
  temperature: z.number().min(0).max(2).default(0.7),
  enabled: z.boolean().default(true),
  priority: z.number().default(1),
  contextWindow: z.number().default(128000),
  costPer1kTokens: z.object({
    input: z.number().default(0.01),
    output: z.number().default(0.03),
  }).optional(),
  azureDeploymentName: z.string().optional(),
  azureApiVersion: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

// Routing Configuration
export const routingConfigSchema = z.object({
  taskComplexityThreshold: z.number().min(0).max(1).default(0.7),
  contextSizeThreshold: z.number().default(90000),
  rateLimitThreshold: z.number().min(0).max(1).default(0.2),
  enableFallback: z.boolean().default(true),
  userPreference: z.string().optional(),
});

export type RoutingConfig = z.infer<typeof routingConfigSchema>;

// Provider Metrics
export const providerMetricsSchema = z.object({
  providerName: z.string(),
  totalRequests: z.number().default(0),
  successfulRequests: z.number().default(0),
  failedRequests: z.number().default(0),
  totalTokensUsed: z.number().default(0),
  totalInputTokens: z.number().default(0),
  totalOutputTokens: z.number().default(0),
  averageResponseTime: z.number().default(0),
  totalCost: z.number().default(0),
  lastUsed: z.string().optional(),
  rateLimitRemaining: z.number().optional(),
  rateLimitReset: z.string().optional(),
  errorCounts: z.record(z.number()).default({}),
});

export type ProviderMetrics = z.infer<typeof providerMetricsSchema>;

// Settings
export const aiSettingsSchema = z.object({
  apiEndpoint: z.string().url(),
  apiKey: z.string(),
  model: z.string(),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  providers: z.array(providerConfigSchema).optional(),
  routing: routingConfigSchema.optional(),
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

// Repository Context
export const repositoryContextSchema = z.object({
  id: z.string(),
  repository: z.string(),
  architecture: z.record(z.any()).optional(),
  dependencies: z.record(z.any()).optional(),
  fileStructure: z.array(z.string()).optional(),
  branches: z.array(z.record(z.any())).optional(),
  recentCommits: z.array(z.record(z.any())).optional(),
  openIssues: z.array(z.record(z.any())).optional(),
  semanticSummary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertRepositoryContextSchema = repositoryContextSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type RepositoryContext = z.infer<typeof repositoryContextSchema>;
export type InsertRepositoryContext = z.infer<typeof insertRepositoryContextSchema>;

// WebSocket Message Types
export const wsMessageTypeSchema = z.enum([
  "task_update",
  "log_added",
  "reasoning_added",
  "diff_created",
  "runner_status",
  "ping",
  "pong",
]);

export type WSMessageType = z.infer<typeof wsMessageTypeSchema>;

export const wsTaskUpdateSchema = z.object({
  type: z.literal("task_update"),
  taskId: z.string(),
  status: taskStatusSchema.optional(),
  progress: z.number().min(0).max(100).optional(),
  updates: z.record(z.any()).optional(),
});

export const wsLogAddedSchema = z.object({
  type: z.literal("log_added"),
  taskId: z.string(),
  log: logEntrySchema,
});

export const wsReasoningAddedSchema = z.object({
  type: z.literal("reasoning_added"),
  taskId: z.string(),
  step: reasoningStepSchema,
});

export const wsDiffCreatedSchema = z.object({
  type: z.literal("diff_created"),
  taskId: z.string(),
  diff: fileDiffSchema,
});

export const wsRunnerStatusSchema = z.object({
  type: z.literal("runner_status"),
  taskId: z.string(),
  runnerId: z.string(),
  status: z.string(),
  metadata: z.record(z.any()).optional(),
});

export const wsPingPongSchema = z.object({
  type: z.enum(["ping", "pong"]),
  timestamp: z.number(),
});

export const wsMessageSchema = z.union([
  wsTaskUpdateSchema,
  wsLogAddedSchema,
  wsReasoningAddedSchema,
  wsDiffCreatedSchema,
  wsRunnerStatusSchema,
  wsPingPongSchema,
]);

export type WSTaskUpdate = z.infer<typeof wsTaskUpdateSchema>;
export type WSLogAdded = z.infer<typeof wsLogAddedSchema>;
export type WSReasoningAdded = z.infer<typeof wsReasoningAddedSchema>;
export type WSDiffCreated = z.infer<typeof wsDiffCreatedSchema>;
export type WSRunnerStatus = z.infer<typeof wsRunnerStatusSchema>;
export type WSPingPong = z.infer<typeof wsPingPongSchema>;
export type WSMessage = z.infer<typeof wsMessageSchema>;

// MCP (Model Context Protocol) Types
export const mcpServerTypeSchema = z.enum(["github", "playwright", "custom"]);
export type MCPServerType = z.infer<typeof mcpServerTypeSchema>;

export const mcpConnectionStatusSchema = z.enum(["connected", "disconnected", "error", "initializing"]);
export type MCPConnectionStatus = z.infer<typeof mcpConnectionStatusSchema>;

// MCP Tool Definition
export const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.any()),
});

export type MCPTool = z.infer<typeof mcpToolSchema>;

// MCP Resource Definition
export const mcpResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

export type MCPResource = z.infer<typeof mcpResourceSchema>;

// MCP Prompt Template
export const mcpPromptTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    required: z.boolean().default(false),
  })).optional(),
});

export type MCPPromptTemplate = z.infer<typeof mcpPromptTemplateSchema>;

// MCP Server Configuration
export const mcpServerConfigSchema = z.object({
  name: z.string(),
  type: mcpServerTypeSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  endpoint: z.string().url().optional(),
  apiKey: z.string().optional(),
  config: z.record(z.any()).optional(),
});

export type MCPServerConfig = z.infer<typeof mcpServerConfigSchema>;

// MCP Connection (Database entity)
export const mcpConnectionSchema = z.object({
  id: z.string(),
  type: mcpServerTypeSchema,
  name: z.string(),
  config: z.record(z.any()),
  status: mcpConnectionStatusSchema,
  lastUsed: z.string().optional(),
  createdAt: z.string(),
});

export const insertMCPConnectionSchema = mcpConnectionSchema.omit({
  id: true,
  createdAt: true,
});

export type MCPConnection = z.infer<typeof mcpConnectionSchema>;
export type InsertMCPConnection = z.infer<typeof insertMCPConnectionSchema>;

// MCP Tool Execution Request
export const mcpToolExecutionRequestSchema = z.object({
  toolName: z.string(),
  params: z.record(z.any()).optional(),
});

export type MCPToolExecutionRequest = z.infer<typeof mcpToolExecutionRequestSchema>;

// MCP Tool Execution Result
export const mcpToolExecutionResultSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
  executionTime: z.number().optional(),
});

export type MCPToolExecutionResult = z.infer<typeof mcpToolExecutionResultSchema>;

export * from "./db-schema";
