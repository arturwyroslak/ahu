import {
  type Task,
  type InsertTask,
  type GithubEvent,
  type InsertGithubEvent,
  type Settings,
  type LogEntry,
  type ReasoningStep,
  type FileDiff,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Tasks
  getTask(id: string): Promise<Task | undefined>;
  getAllTasks(): Promise<Task[]>;
  getActiveTasks(): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;
  addTaskLog(taskId: string, log: LogEntry): Promise<void>;
  addTaskReasoning(taskId: string, step: ReasoningStep): Promise<void>;
  addTaskDiff(taskId: string, diff: FileDiff): Promise<void>;
  
  // Events
  getEvent(id: string): Promise<GithubEvent | undefined>;
  getAllEvents(): Promise<GithubEvent[]>;
  getRecentEvents(limit: number): Promise<GithubEvent[]>;
  createEvent(event: InsertGithubEvent): Promise<GithubEvent>;
  updateEvent(id: string, updates: Partial<GithubEvent>): Promise<GithubEvent | undefined>;
  
  // Settings
  getSettings(): Promise<Settings | undefined>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
}

export class MemStorage implements IStorage {
  private tasks: Map<string, Task>;
  private events: Map<string, GithubEvent>;
  private settings: Settings | undefined;

  constructor() {
    this.tasks = new Map();
    this.events = new Map();
  }

  // Tasks
  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async getAllTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async getActiveTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(
      (task) => task.status === "planning" || task.status === "executing" || task.status === "queued"
    );
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const task: Task = {
      ...insertTask,
      id,
      createdAt: now,
      updatedAt: now,
      logs: [],
      reasoning: [],
      diffs: [],
    };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updatedTask = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async addTaskLog(taskId: string, log: LogEntry): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.logs.push(log);
      task.updatedAt = new Date().toISOString();
    }
  }

  async addTaskReasoning(taskId: string, step: ReasoningStep): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.reasoning.push(step);
      task.updatedAt = new Date().toISOString();
    }
  }

  async addTaskDiff(taskId: string, diff: FileDiff): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.diffs.push(diff);
      task.updatedAt = new Date().toISOString();
    }
  }

  // Events
  async getEvent(id: string): Promise<GithubEvent | undefined> {
    return this.events.get(id);
  }

  async getAllEvents(): Promise<GithubEvent[]> {
    return Array.from(this.events.values());
  }

  async getRecentEvents(limit: number): Promise<GithubEvent[]> {
    const events = Array.from(this.events.values());
    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async createEvent(insertEvent: InsertGithubEvent): Promise<GithubEvent> {
    const id = randomUUID();
    const event: GithubEvent = {
      ...insertEvent,
      id,
      timestamp: new Date().toISOString(),
    };
    this.events.set(id, event);
    return event;
  }

  async updateEvent(id: string, updates: Partial<GithubEvent>): Promise<GithubEvent | undefined> {
    const event = this.events.get(id);
    if (!event) return undefined;

    const updatedEvent = {
      ...event,
      ...updates,
    };
    this.events.set(id, updatedEvent);
    return updatedEvent;
  }

  // Settings
  async getSettings(): Promise<Settings | undefined> {
    return this.settings;
  }

  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    this.settings = {
      ...this.settings,
      ...updates,
    } as Settings;
    return this.settings;
  }
}

export const storage = new MemStorage();
