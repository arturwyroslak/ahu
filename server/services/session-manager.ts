import type { Task, LogEntry, ReasoningStep, FileDiff } from "@shared/schema";
import type { IStorage } from "../storage";
import { EventEmitter } from "events";

export interface SessionState {
  sessionId: string;
  taskId: string;
  repository: string;
  branch: string;
  status: "initializing" | "planning" | "executing" | "feedback" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  metadata: {
    userId?: string;
    triggeredBy: "issue" | "pr_comment" | "agents_panel" | "cli" | "api";
    parentSessionId?: string; // For iterative feedback
    iterationCount: number;
  };
  executionContext: {
    currentStep: number;
    totalSteps: number;
    currentTool?: string;
    toolHistory: ToolExecution[];
    activeRunners: string[]; // Container runner IDs
  };
  aiContext: {
    messagesCount: number;
    tokensUsed: number;
    providersUsed: string[];
    lastPromptTimestamp?: number;
  };
  gitContext: {
    baseBranch: string;
    headBranch: string;
    prNumber?: number;
    prUrl?: string;
    commitCount: number;
    filesChanged: number;
  };
  ttl: number; // Session timeout in seconds
}

export interface ToolExecution {
  toolName: string;
  timestamp: number;
  input: any;
  output: any;
  duration: number;
  success: boolean;
  error?: string;
}

export interface TimelineEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  type: "session_start" | "plan_generated" | "tool_executed" | "code_changed" | "test_run" | "pr_created" | "pr_updated" | "feedback_received" | "session_end";
  actor: "agent" | "user" | "system";
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Session Manager - Manages agent session lifecycle and state
 * 
 * Architecture:
 * - In-memory cache for active sessions (would use Redis in production)
 * - Persistent storage via GitHub (PR body, timeline, commits)
 * - Event emission for real-time updates
 */
export class SessionManager extends EventEmitter {
  private activeSessions: Map<string, SessionState> = new Map();
  private sessionTimelines: Map<string, TimelineEvent[]> = new Map();
  private storage: IStorage;
  private sessionTTL: number = 3600; // 1 hour default

  constructor(storage: IStorage, sessionTTL?: number) {
    super();
    this.storage = storage;
    if (sessionTTL) {
      this.sessionTTL = sessionTTL;
    }

    // Cleanup expired sessions every 5 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 300000);
  }

  /**
   * Create new agent session
   */
  async createSession(taskId: string, metadata: {
    repository: string;
    branch: string;
    triggeredBy: SessionState["metadata"]["triggeredBy"];
    userId?: string;
    parentSessionId?: string;
  }): Promise<SessionState> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const session: SessionState = {
      sessionId,
      taskId,
      repository: metadata.repository,
      branch: metadata.branch,
      status: "initializing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        userId: metadata.userId,
        triggeredBy: metadata.triggeredBy,
        parentSessionId: metadata.parentSessionId,
        iterationCount: metadata.parentSessionId ? await this.getIterationCount(metadata.parentSessionId) + 1 : 0,
      },
      executionContext: {
        currentStep: 0,
        totalSteps: 0,
        toolHistory: [],
        activeRunners: [],
      },
      aiContext: {
        messagesCount: 0,
        tokensUsed: 0,
        providersUsed: [],
      },
      gitContext: {
        baseBranch: "main",
        headBranch: metadata.branch,
        commitCount: 0,
        filesChanged: 0,
      },
      ttl: this.sessionTTL,
    };

    this.activeSessions.set(sessionId, session);
    this.sessionTimelines.set(sessionId, []);

    // Log session start event
    await this.addTimelineEvent(sessionId, {
      type: "session_start",
      actor: "system",
      description: `Agent session started for task ${taskId}`,
      metadata: {
        triggeredBy: metadata.triggeredBy,
        repository: metadata.repository,
      },
    });

    this.emit("session:created", session);

    // Persist to storage
    await this.persistSession(session);

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get session by task ID
   */
  getSessionByTaskId(taskId: string): SessionState | undefined {
    return Array.from(this.activeSessions.values()).find(
      session => session.taskId === taskId
    );
  }

  /**
   * Update session state
   */
  async updateSession(
    sessionId: string,
    updates: Partial<SessionState>
  ): Promise<SessionState | undefined> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return undefined;

    const updatedSession = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
    };

    this.activeSessions.set(sessionId, updatedSession);
    this.emit("session:updated", updatedSession);

    // Persist changes
    await this.persistSession(updatedSession);

    return updatedSession;
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: SessionState["status"]
  ): Promise<void> {
    await this.updateSession(sessionId, { status });

    await this.addTimelineEvent(sessionId, {
      type: status === "completed" ? "session_end" : "session_start",
      actor: "system",
      description: `Session status changed to: ${status}`,
    });
  }

  /**
   * Record tool execution
   */
  async recordToolExecution(
    sessionId: string,
    execution: Omit<ToolExecution, "timestamp">
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const toolExecution: ToolExecution = {
      ...execution,
      timestamp: Date.now(),
    };

    session.executionContext.toolHistory.push(toolExecution);
    session.updatedAt = Date.now();

    this.activeSessions.set(sessionId, session);

    await this.addTimelineEvent(sessionId, {
      type: "tool_executed",
      actor: "agent",
      description: `Executed tool: ${execution.toolName}`,
      metadata: {
        success: execution.success,
        duration: execution.duration,
      },
    });

    this.emit("session:tool_executed", { sessionId, execution: toolExecution });
  }

  /**
   * Update AI context
   */
  async updateAIContext(
    sessionId: string,
    update: {
      messagesAdded?: number;
      tokensUsed?: number;
      provider?: string;
    }
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    if (update.messagesAdded) {
      session.aiContext.messagesCount += update.messagesAdded;
    }
    if (update.tokensUsed) {
      session.aiContext.tokensUsed += update.tokensUsed;
    }
    if (update.provider && !session.aiContext.providersUsed.includes(update.provider)) {
      session.aiContext.providersUsed.push(update.provider);
    }
    session.aiContext.lastPromptTimestamp = Date.now();

    this.activeSessions.set(sessionId, session);
    this.emit("session:ai_updated", { sessionId, aiContext: session.aiContext });
  }

  /**
   * Update Git context
   */
  async updateGitContext(
    sessionId: string,
    update: Partial<SessionState["gitContext"]>
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.gitContext = {
      ...session.gitContext,
      ...update,
    };

    this.activeSessions.set(sessionId, session);

    if (update.prUrl) {
      await this.addTimelineEvent(sessionId, {
        type: update.prNumber ? "pr_updated" : "pr_created",
        actor: "agent",
        description: `Pull request ${update.prNumber ? "updated" : "created"}: ${update.prUrl}`,
        metadata: update,
      });
    }

    this.emit("session:git_updated", { sessionId, gitContext: session.gitContext });
  }

  /**
   * Add container runner to session
   */
  async addActiveRunner(sessionId: string, runnerId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    if (!session.executionContext.activeRunners.includes(runnerId)) {
      session.executionContext.activeRunners.push(runnerId);
      this.activeSessions.set(sessionId, session);
    }
  }

  /**
   * Remove container runner from session
   */
  async removeActiveRunner(sessionId: string, runnerId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.executionContext.activeRunners = session.executionContext.activeRunners.filter(
      id => id !== runnerId
    );
    this.activeSessions.set(sessionId, session);
  }

  /**
   * Add timeline event
   */
  async addTimelineEvent(
    sessionId: string,
    event: Omit<TimelineEvent, "id" | "sessionId" | "timestamp">
  ): Promise<TimelineEvent> {
    const timelineEvent: TimelineEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      sessionId,
      timestamp: Date.now(),
      ...event,
    };

    const timeline = this.sessionTimelines.get(sessionId) || [];
    timeline.push(timelineEvent);
    this.sessionTimelines.set(sessionId, timeline);

    this.emit("timeline:event", timelineEvent);

    // Persist timeline event to task logs
    await this.persistTimelineEvent(sessionId, timelineEvent);

    return timelineEvent;
  }

  /**
   * Get session timeline
   */
  getTimeline(sessionId: string): TimelineEvent[] {
    return this.sessionTimelines.get(sessionId) || [];
  }

  /**
   * Get recent timeline events
   */
  getRecentTimelineEvents(sessionId: string, limit: number = 10): TimelineEvent[] {
    const timeline = this.sessionTimelines.get(sessionId) || [];
    return timeline.slice(-limit);
  }

  /**
   * Handle feedback on session (iterative improvement)
   */
  async handleFeedback(
    sessionId: string,
    feedback: {
      source: "pr_comment" | "review" | "api";
      author: string;
      content: string;
      metadata?: Record<string, any>;
    }
  ): Promise<SessionState | undefined> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return undefined;

    await this.addTimelineEvent(sessionId, {
      type: "feedback_received",
      actor: "user",
      description: `Feedback received from ${feedback.author}`,
      metadata: feedback,
    });

    // Create child session for iterative improvement
    const task = await this.storage.getTask(session.taskId);
    if (!task) return undefined;

    const childSession = await this.createSession(session.taskId, {
      repository: session.repository,
      branch: session.branch,
      triggeredBy: "pr_comment",
      parentSessionId: sessionId,
    });

    this.emit("session:feedback", { sessionId, feedback, childSessionId: childSession.sessionId });

    return childSession;
  }

  /**
   * End session
   */
  async endSession(
    sessionId: string,
    finalStatus: "completed" | "failed",
    metadata?: Record<string, any>
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.status = finalStatus;
    session.updatedAt = Date.now();

    await this.addTimelineEvent(sessionId, {
      type: "session_end",
      actor: "system",
      description: `Session ended with status: ${finalStatus}`,
      metadata,
    });

    // Persist final state
    await this.persistSession(session);

    this.emit("session:ended", session);

    // Move to inactive after delay (keep for log retrieval)
    setTimeout(() => {
      this.activeSessions.delete(sessionId);
    }, 300000); // 5 minutes
  }

  /**
   * Get iteration count for session chain
   */
  private async getIterationCount(parentSessionId: string): Promise<number> {
    const parentSession = this.activeSessions.get(parentSessionId);
    if (!parentSession) return 0;

    return parentSession.metadata.iterationCount + 1;
  }

  /**
   * Persist session to storage (GitHub)
   */
  private async persistSession(session: SessionState): Promise<void> {
    // In production, this would update PR body with session state
    // For now, store in task metadata
    await this.storage.updateTask(session.taskId, {
      progress: this.calculateProgress(session),
    });
  }

  /**
   * Persist timeline event to task logs
   */
  private async persistTimelineEvent(
    sessionId: string,
    event: TimelineEvent
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const logEntry: LogEntry = {
      id: event.id,
      timestamp: new Date(event.timestamp).toISOString(),
      level: event.type.includes("error") || event.type.includes("failed") ? "error" : "info",
      message: event.description,
    };

    await this.storage.addTaskLog(session.taskId, logEntry);
  }

  /**
   * Calculate session progress percentage
   */
  private calculateProgress(session: SessionState): number {
    if (session.status === "completed") return 100;
    if (session.status === "failed") return 0;
    if (session.executionContext.totalSteps === 0) return 0;

    return Math.min(
      Math.round((session.executionContext.currentStep / session.executionContext.totalSteps) * 100),
      95 // Cap at 95% until completed
    );
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of Array.from(this.activeSessions.entries())) {
      const age = (now - session.updatedAt) / 1000; // in seconds

      if (age > session.ttl) {
        this.activeSessions.delete(sessionId);
        this.sessionTimelines.delete(sessionId);
        this.emit("session:expired", sessionId);
      }
    }
  }

  /**
   * Get all active sessions
   */
  getAllActiveSessions(): SessionState[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get active sessions (alias)
   */
  getActiveSessions(): SessionState[] {
    return this.getAllActiveSessions();
  }

  /**
   * Get recent timeline events across all sessions
   */
  getRecentTimelineEvents(limit: number = 20): Array<{
    id: string;
    sessionId: string;
    type: string;
    timestamp: string;
    description: string;
    metadata?: Record<string, any>;
  }> {
    const allEvents: Array<any> = [];
    
    // Collect events from all sessions
    for (const [sessionId, events] of Array.from(this.sessionTimelines.entries())) {
      events.forEach(event => {
        allEvents.push({
          ...event,
          sessionId,
        });
      });
    }
    
    // Sort by timestamp (newest first) and limit
    return allEvents
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get sessions by repository
   */
  getSessionsByRepository(repository: string): SessionState[] {
    return Array.from(this.activeSessions.values()).filter(
      session => session.repository === repository
    );
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    duration: number;
    toolExecutions: number;
    successRate: number;
    tokensUsed: number;
    iterationCount: number;
  } | undefined {
    const session = this.activeSessions.get(sessionId);
    if (!session) return undefined;

    const toolExecutions = session.executionContext.toolHistory;
    const successfulExecutions = toolExecutions.filter(t => t.success).length;

    return {
      duration: Date.now() - session.createdAt,
      toolExecutions: toolExecutions.length,
      successRate: toolExecutions.length > 0 ? (successfulExecutions / toolExecutions.length) * 100 : 0,
      tokensUsed: session.aiContext.tokensUsed,
      iterationCount: session.metadata.iterationCount,
    };
  }
}
