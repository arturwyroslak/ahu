import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, or, inArray } from "drizzle-orm";
import {
  tasks,
  taskLogs,
  reasoningSteps,
  fileDiffs,
  githubEvents,
  settings,
  repositoryContexts,
  containerRunners,
  mcpConnections,
} from "@shared/schema";
import type {
  Task,
  InsertTask,
  GithubEvent,
  InsertGithubEvent,
  Settings,
  LogEntry,
  ReasoningStep,
  FileDiff,
  RepositoryContext,
  InsertRepositoryContext,
  MCPConnection,
  InsertMCPConnection,
} from "@shared/schema";
import type { IStorage } from "./storage";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

export class DatabaseStorage implements IStorage {
  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return undefined;

    const logs = await db.select().from(taskLogs).where(eq(taskLogs.taskId, id));
    const reasoning = await db.select().from(reasoningSteps).where(eq(reasoningSteps.taskId, id));
    const diffs = await db.select().from(fileDiffs).where(eq(fileDiffs.taskId, id));

    return {
      id: task.id,
      title: task.title,
      status: task.status as Task["status"],
      repository: task.repository,
      branch: task.branch || undefined,
      summary: task.summary,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      progress: task.progress,
      eventId: task.eventId || undefined,
      logs: logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level as LogEntry["level"],
        message: log.message,
      })),
      reasoning: reasoning.map((step) => ({
        id: step.id,
        timestamp: step.timestamp,
        description: step.description,
        confidence: step.confidence || undefined,
        completed: step.completed,
      })),
      diffs: diffs.map((diff) => ({
        path: diff.path,
        lines: diff.lines as FileDiff["lines"],
      })),
    };
  }

  async getAllTasks(): Promise<Task[]> {
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    
    const taskIds = allTasks.map((t) => t.id);
    if (taskIds.length === 0) return [];

    const allLogs = await db.select().from(taskLogs).where(inArray(taskLogs.taskId, taskIds));
    const allReasoning = await db.select().from(reasoningSteps).where(inArray(reasoningSteps.taskId, taskIds));
    const allDiffs = await db.select().from(fileDiffs).where(inArray(fileDiffs.taskId, taskIds));

    const logsMap = new Map<string, typeof allLogs>();
    const reasoningMap = new Map<string, typeof allReasoning>();
    const diffsMap = new Map<string, typeof allDiffs>();

    for (const log of allLogs) {
      if (!logsMap.has(log.taskId)) logsMap.set(log.taskId, []);
      logsMap.get(log.taskId)!.push(log);
    }
    for (const step of allReasoning) {
      if (!reasoningMap.has(step.taskId)) reasoningMap.set(step.taskId, []);
      reasoningMap.get(step.taskId)!.push(step);
    }
    for (const diff of allDiffs) {
      if (!diffsMap.has(diff.taskId)) diffsMap.set(diff.taskId, []);
      diffsMap.get(diff.taskId)!.push(diff);
    }

    return allTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status as Task["status"],
      repository: task.repository,
      branch: task.branch || undefined,
      summary: task.summary,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      progress: task.progress,
      eventId: task.eventId || undefined,
      logs: (logsMap.get(task.id) || []).map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level as LogEntry["level"],
        message: log.message,
      })),
      reasoning: (reasoningMap.get(task.id) || []).map((step) => ({
        id: step.id,
        timestamp: step.timestamp,
        description: step.description,
        confidence: step.confidence || undefined,
        completed: step.completed,
      })),
      diffs: (diffsMap.get(task.id) || []).map((diff) => ({
        path: diff.path,
        lines: diff.lines as FileDiff["lines"],
      })),
    }));
  }

  async getActiveTasks(): Promise<Task[]> {
    const activeTasks = await db
      .select()
      .from(tasks)
      .where(or(
        eq(tasks.status, "planning"),
        eq(tasks.status, "executing"),
        eq(tasks.status, "queued")
      ))
      .orderBy(desc(tasks.createdAt));

    if (activeTasks.length === 0) return [];

    const taskIds = activeTasks.map((t) => t.id);
    const allLogs = await db.select().from(taskLogs).where(inArray(taskLogs.taskId, taskIds));
    const allReasoning = await db.select().from(reasoningSteps).where(inArray(reasoningSteps.taskId, taskIds));
    const allDiffs = await db.select().from(fileDiffs).where(inArray(fileDiffs.taskId, taskIds));

    const logsMap = new Map<string, typeof allLogs>();
    const reasoningMap = new Map<string, typeof allReasoning>();
    const diffsMap = new Map<string, typeof allDiffs>();

    for (const log of allLogs) {
      if (!logsMap.has(log.taskId)) logsMap.set(log.taskId, []);
      logsMap.get(log.taskId)!.push(log);
    }
    for (const step of allReasoning) {
      if (!reasoningMap.has(step.taskId)) reasoningMap.set(step.taskId, []);
      reasoningMap.get(step.taskId)!.push(step);
    }
    for (const diff of allDiffs) {
      if (!diffsMap.has(diff.taskId)) diffsMap.set(diff.taskId, []);
      diffsMap.get(diff.taskId)!.push(diff);
    }

    return activeTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status as Task["status"],
      repository: task.repository,
      branch: task.branch || undefined,
      summary: task.summary,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      progress: task.progress,
      eventId: task.eventId || undefined,
      logs: (logsMap.get(task.id) || []).map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level as LogEntry["level"],
        message: log.message,
      })),
      reasoning: (reasoningMap.get(task.id) || []).map((step) => ({
        id: step.id,
        timestamp: step.timestamp,
        description: step.description,
        confidence: step.confidence || undefined,
        completed: step.completed,
      })),
      diffs: (diffsMap.get(task.id) || []).map((diff) => ({
        path: diff.path,
        lines: diff.lines as FileDiff["lines"],
      })),
    }));
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values({
        title: insertTask.title,
        status: insertTask.status,
        repository: insertTask.repository,
        branch: insertTask.branch,
        summary: insertTask.summary,
        progress: insertTask.progress || 0,
        eventId: insertTask.eventId,
      })
      .returning();

    return {
      id: task.id,
      title: task.title,
      status: task.status as Task["status"],
      repository: task.repository,
      branch: task.branch || undefined,
      summary: task.summary,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      progress: task.progress,
      eventId: task.eventId || undefined,
      logs: [],
      reasoning: [],
      diffs: [],
    };
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({
        ...(updates.title && { title: updates.title }),
        ...(updates.status && { status: updates.status }),
        ...(updates.repository && { repository: updates.repository }),
        ...(updates.branch !== undefined && { branch: updates.branch }),
        ...(updates.summary && { summary: updates.summary }),
        ...(updates.progress !== undefined && { progress: updates.progress }),
        ...(updates.eventId !== undefined && { eventId: updates.eventId }),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    if (!updated) return undefined;

    return this.getTask(id);
  }

  async addTaskLog(taskId: string, log: LogEntry): Promise<void> {
    await db.insert(taskLogs).values({
      taskId,
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
    });
  }

  async addTaskReasoning(taskId: string, step: ReasoningStep): Promise<void> {
    await db.insert(reasoningSteps).values({
      taskId,
      timestamp: step.timestamp,
      description: step.description,
      confidence: step.confidence,
      completed: step.completed,
    });
  }

  async addTaskDiff(taskId: string, diff: FileDiff): Promise<void> {
    await db.insert(fileDiffs).values({
      taskId,
      path: diff.path,
      lines: diff.lines,
    });
  }

  async getEvent(id: string): Promise<GithubEvent | undefined> {
    const [event] = await db.select().from(githubEvents).where(eq(githubEvents.id, id));
    if (!event) return undefined;

    return {
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      type: event.type as GithubEvent["type"],
      repository: event.repository,
      action: event.action,
      status: event.status as GithubEvent["status"],
      payload: event.payload as Record<string, any> | undefined,
      taskId: event.taskId || undefined,
    };
  }

  async getAllEvents(): Promise<GithubEvent[]> {
    const events = await db.select().from(githubEvents).orderBy(desc(githubEvents.timestamp));
    
    return events.map((event) => ({
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      type: event.type as GithubEvent["type"],
      repository: event.repository,
      action: event.action,
      status: event.status as GithubEvent["status"],
      payload: event.payload as Record<string, any> | undefined,
      taskId: event.taskId || undefined,
    }));
  }

  async getRecentEvents(limit: number): Promise<GithubEvent[]> {
    const events = await db
      .select()
      .from(githubEvents)
      .orderBy(desc(githubEvents.timestamp))
      .limit(limit);

    return events.map((event) => ({
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      type: event.type as GithubEvent["type"],
      repository: event.repository,
      action: event.action,
      status: event.status as GithubEvent["status"],
      payload: event.payload as Record<string, any> | undefined,
      taskId: event.taskId || undefined,
    }));
  }

  async createEvent(insertEvent: InsertGithubEvent): Promise<GithubEvent> {
    const [event] = await db
      .insert(githubEvents)
      .values({
        type: insertEvent.type,
        repository: insertEvent.repository,
        action: insertEvent.action,
        status: insertEvent.status,
        payload: insertEvent.payload,
        taskId: insertEvent.taskId,
      })
      .returning();

    return {
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      type: event.type as GithubEvent["type"],
      repository: event.repository,
      action: event.action,
      status: event.status as GithubEvent["status"],
      payload: event.payload as Record<string, any> | undefined,
      taskId: event.taskId || undefined,
    };
  }

  async updateEvent(id: string, updates: Partial<GithubEvent>): Promise<GithubEvent | undefined> {
    const [updated] = await db
      .update(githubEvents)
      .set({
        ...(updates.type && { type: updates.type }),
        ...(updates.repository && { repository: updates.repository }),
        ...(updates.action && { action: updates.action }),
        ...(updates.status && { status: updates.status }),
        ...(updates.payload !== undefined && { payload: updates.payload }),
        ...(updates.taskId !== undefined && { taskId: updates.taskId }),
      })
      .where(eq(githubEvents.id, id))
      .returning();

    if (!updated) return undefined;

    return this.getEvent(id);
  }

  async getSettings(): Promise<Settings | undefined> {
    const [setting] = await db.select().from(settings).limit(1);
    if (!setting) return undefined;

    return {
      ai: {
        apiEndpoint: setting.aiEndpoint,
        apiKey: setting.aiKey,
        model: setting.aiModel,
        maxTokens: setting.aiMaxTokens,
        temperature: setting.aiTemperature / 100,
      },
      github: {
        token: setting.githubToken,
        webhookSecret: setting.githubWebhookSecret || undefined,
      },
      autoApprove: setting.autoApprove,
    };
  }

  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    const existing = await db.select().from(settings).limit(1);

    const settingsData = {
      aiEndpoint: updates.ai?.apiEndpoint || existing[0]?.aiEndpoint || "https://api.openai.com/v1",
      aiKey: updates.ai?.apiKey || existing[0]?.aiKey || "",
      aiModel: updates.ai?.model || existing[0]?.aiModel || "gpt-4",
      aiMaxTokens: updates.ai?.maxTokens || existing[0]?.aiMaxTokens || 4096,
      aiTemperature: updates.ai?.temperature !== undefined 
        ? Math.round(updates.ai.temperature * 100)
        : (existing[0]?.aiTemperature || 70),
      githubToken: updates.github?.token || existing[0]?.githubToken || "",
      githubWebhookSecret: updates.github?.webhookSecret || existing[0]?.githubWebhookSecret,
      autoApprove: updates.autoApprove !== undefined ? updates.autoApprove : existing[0]?.autoApprove || false,
      updatedAt: new Date(),
    };

    let result;
    if (existing.length > 0) {
      [result] = await db
        .update(settings)
        .set(settingsData)
        .where(eq(settings.id, existing[0].id))
        .returning();
    } else {
      [result] = await db.insert(settings).values(settingsData).returning();
    }

    return {
      ai: {
        apiEndpoint: result.aiEndpoint,
        apiKey: result.aiKey,
        model: result.aiModel,
        maxTokens: result.aiMaxTokens,
        temperature: result.aiTemperature / 100,
      },
      github: {
        token: result.githubToken,
        webhookSecret: result.githubWebhookSecret || undefined,
      },
      autoApprove: result.autoApprove,
    };
  }

  async getRepositoryContext(repository: string): Promise<RepositoryContext | undefined> {
    const [context] = await db
      .select()
      .from(repositoryContexts)
      .where(eq(repositoryContexts.repository, repository));
    
    if (!context) return undefined;

    return {
      id: context.id,
      repository: context.repository,
      architecture: context.architecture as Record<string, any> | undefined,
      dependencies: context.dependencies as Record<string, any> | undefined,
      fileStructure: context.fileStructure as string[] | undefined,
      branches: context.branches as Array<Record<string, any>> | undefined,
      recentCommits: context.recentCommits as Array<Record<string, any>> | undefined,
      openIssues: context.openIssues as Array<Record<string, any>> | undefined,
      semanticSummary: context.semanticSummary || undefined,
      createdAt: context.createdAt.toISOString(),
      updatedAt: context.updatedAt.toISOString(),
    };
  }

  async createRepositoryContext(insertContext: InsertRepositoryContext): Promise<RepositoryContext> {
    const [context] = await db
      .insert(repositoryContexts)
      .values({
        repository: insertContext.repository,
        architecture: insertContext.architecture,
        dependencies: insertContext.dependencies,
        fileStructure: insertContext.fileStructure,
        branches: insertContext.branches,
        recentCommits: insertContext.recentCommits,
        openIssues: insertContext.openIssues,
        semanticSummary: insertContext.semanticSummary,
      })
      .returning();

    return {
      id: context.id,
      repository: context.repository,
      architecture: context.architecture as Record<string, any> | undefined,
      dependencies: context.dependencies as Record<string, any> | undefined,
      fileStructure: context.fileStructure as string[] | undefined,
      branches: context.branches as Array<Record<string, any>> | undefined,
      recentCommits: context.recentCommits as Array<Record<string, any>> | undefined,
      openIssues: context.openIssues as Array<Record<string, any>> | undefined,
      semanticSummary: context.semanticSummary || undefined,
      createdAt: context.createdAt.toISOString(),
      updatedAt: context.updatedAt.toISOString(),
    };
  }

  async updateRepositoryContext(repository: string, updates: Partial<RepositoryContext>): Promise<RepositoryContext | undefined> {
    const [updated] = await db
      .update(repositoryContexts)
      .set({
        ...(updates.architecture !== undefined && { architecture: updates.architecture }),
        ...(updates.dependencies !== undefined && { dependencies: updates.dependencies }),
        ...(updates.fileStructure !== undefined && { fileStructure: updates.fileStructure }),
        ...(updates.branches !== undefined && { branches: updates.branches }),
        ...(updates.recentCommits !== undefined && { recentCommits: updates.recentCommits }),
        ...(updates.openIssues !== undefined && { openIssues: updates.openIssues }),
        ...(updates.semanticSummary !== undefined && { semanticSummary: updates.semanticSummary }),
        updatedAt: new Date(),
      })
      .where(eq(repositoryContexts.repository, repository))
      .returning();

    if (!updated) return undefined;

    return this.getRepositoryContext(repository);
  }

  async getMCPConnection(id: string): Promise<MCPConnection | undefined> {
    const [connection] = await db
      .select()
      .from(mcpConnections)
      .where(eq(mcpConnections.id, id));

    if (!connection) return undefined;

    return {
      id: connection.id,
      type: connection.type as MCPConnection["type"],
      name: connection.name,
      config: connection.config as Record<string, any>,
      status: connection.status as MCPConnection["status"],
      lastUsed: connection.lastUsed?.toISOString(),
      createdAt: connection.createdAt.toISOString(),
    };
  }

  async getAllMCPConnections(): Promise<MCPConnection[]> {
    const connections = await db
      .select()
      .from(mcpConnections)
      .orderBy(desc(mcpConnections.createdAt));

    return connections.map((connection) => ({
      id: connection.id,
      type: connection.type as MCPConnection["type"],
      name: connection.name,
      config: connection.config as Record<string, any>,
      status: connection.status as MCPConnection["status"],
      lastUsed: connection.lastUsed?.toISOString(),
      createdAt: connection.createdAt.toISOString(),
    }));
  }

  async createMCPConnection(insertConnection: InsertMCPConnection): Promise<MCPConnection> {
    const [connection] = await db
      .insert(mcpConnections)
      .values({
        type: insertConnection.type,
        name: insertConnection.name,
        config: insertConnection.config,
        status: insertConnection.status,
        lastUsed: insertConnection.lastUsed ? new Date(insertConnection.lastUsed) : null,
      })
      .returning();

    return {
      id: connection.id,
      type: connection.type as MCPConnection["type"],
      name: connection.name,
      config: connection.config as Record<string, any>,
      status: connection.status as MCPConnection["status"],
      lastUsed: connection.lastUsed?.toISOString(),
      createdAt: connection.createdAt.toISOString(),
    };
  }

  async updateMCPConnection(id: string, updates: Partial<MCPConnection>): Promise<MCPConnection | undefined> {
    const [updated] = await db
      .update(mcpConnections)
      .set({
        ...(updates.type && { type: updates.type }),
        ...(updates.name && { name: updates.name }),
        ...(updates.config !== undefined && { config: updates.config }),
        ...(updates.status && { status: updates.status }),
        ...(updates.lastUsed !== undefined && { lastUsed: updates.lastUsed ? new Date(updates.lastUsed) : null }),
      })
      .where(eq(mcpConnections.id, id))
      .returning();

    if (!updated) return undefined;

    return this.getMCPConnection(id);
  }

  async deleteMCPConnection(id: string): Promise<boolean> {
    const result = await db
      .delete(mcpConnections)
      .where(eq(mcpConnections.id, id));

    return true;
  }
}

export const storage = new DatabaseStorage();
