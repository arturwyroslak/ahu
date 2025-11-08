import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AIService } from "./services/ai";
import { GitHubService } from "./services/github";
import {
  insertTaskSchema,
  insertGithubEventSchema,
  settingsSchema,
  type LogEntry,
  type ReasoningStep,
} from "@shared/schema";
import { randomUUID } from "crypto";

// SSE clients for real-time log streaming
const sseClients = new Map<string, Set<any>>();

let aiService: AIService | null = null;
let githubService: GitHubService | null = null;

// Initialize services with settings if available
async function initializeServices() {
  const settings = await storage.getSettings();
  if (settings?.ai) {
    aiService = new AIService(settings.ai);
  }
  if (settings?.github) {
    githubService = new GitHubService(settings.github);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  await initializeServices();

  // Middleware to parse JSON
  app.use("/api/webhook", (req, res, next) => {
    let rawBody = "";
    req.on("data", (chunk) => {
      rawBody += chunk.toString();
    });
    req.on("end", () => {
      (req as any).rawBody = rawBody;
      try {
        req.body = JSON.parse(rawBody);
      } catch {
        req.body = {};
      }
      next();
    });
  });

  // === WEBHOOK ENDPOINT ===
  app.post("/api/webhook", async (req, res) => {
    try {
      const signature = req.headers["x-hub-signature-256"] as string;
      const event = req.headers["x-github-event"] as string;
      
      // Verify webhook if secret is configured
      if (githubService && signature) {
        const isValid = await githubService.verifyWebhook(
          (req as any).rawBody,
          signature
        );
        if (!isValid) {
          return res.status(401).json({ error: "Invalid signature" });
        }
      }

      // Create event log
      const githubEvent = await storage.createEvent({
        type: event === "pull_request" ? "pull_request" : 
              event === "push" ? "push" :
              event === "issues" ? "issue" : "comment",
        repository: req.body.repository?.full_name || "unknown",
        action: req.body.action || event,
        status: "pending",
        payload: req.body,
      });

      // If AI service is available, create task automatically
      if (aiService) {
        // Generate task plan from AI
        const plan = await aiService.generateTaskPlan(
          event,
          githubEvent.repository,
          githubEvent.action,
          req.body
        );

        const task = await storage.createTask({
          title: plan.title,
          summary: plan.summary,
          repository: githubEvent.repository,
          status: "queued",
          progress: 0,
          eventId: githubEvent.id,
        });

        await storage.updateEvent(githubEvent.id, { taskId: task.id });

        // Start processing task asynchronously
        processTask(task.id, plan.steps).catch(console.error);
      }

      res.json({ success: true, eventId: githubEvent.id });
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // === TASKS ENDPOINTS ===
  app.get("/api/tasks", async (_req, res) => {
    const tasks = await storage.getAllTasks();
    res.json(tasks);
  });

  app.get("/api/tasks/active", async (_req, res) => {
    const tasks = await storage.getActiveTasks();
    res.json(tasks);
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const task = await storage.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(task);
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const task = await storage.updateTask(req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(task);
  });

  // === EVENTS ENDPOINTS ===
  app.get("/api/events", async (_req, res) => {
    const events = await storage.getAllEvents();
    res.json(events);
  });

  app.get("/api/events/recent", async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const events = await storage.getRecentEvents(limit);
    res.json(events);
  });

  // === SETTINGS ENDPOINTS ===
  app.get("/api/settings", async (_req, res) => {
    const settings = await storage.getSettings();
    if (!settings) {
      return res.json({
        ai: {
          apiEndpoint: "https://api.openai.com/v1",
          apiKey: "",
          model: "gpt-4",
          maxTokens: 4096,
          temperature: 0.7,
        },
        github: {
          token: "",
        },
        autoApprove: false,
      });
    }
    // Don't send API keys to frontend
    res.json({
      ...settings,
      ai: { ...settings.ai, apiKey: settings.ai.apiKey ? "***" : "" },
      github: { ...settings.github, token: settings.github.token ? "***" : "" },
    });
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validatedSettings = settingsSchema.parse(req.body);
      const settings = await storage.updateSettings(validatedSettings);
      
      // Reinitialize services with new settings
      if (settings.ai) {
        aiService = new AIService(settings.ai);
      }
      if (settings.github) {
        githubService = new GitHubService(settings.github);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // === SSE ENDPOINT FOR REAL-TIME LOGS ===
  app.get("/api/tasks/:id/logs/stream", (req, res) => {
    const taskId = req.params.id;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial logs
    storage.getTask(taskId).then((task) => {
      if (task) {
        task.logs.forEach((log) => {
          res.write(`data: ${JSON.stringify(log)}\n\n`);
        });
      }
    });

    // Add client to SSE clients for this task
    if (!sseClients.has(taskId)) {
      sseClients.set(taskId, new Set());
    }
    sseClients.get(taskId)!.add(res);

    // Remove client on disconnect
    req.on("close", () => {
      const clients = sseClients.get(taskId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          sseClients.delete(taskId);
        }
      }
    });
  });

  // === METRICS ENDPOINT ===
  app.get("/api/metrics", async (_req, res) => {
    const allTasks = await storage.getAllTasks();
    const activeTasks = allTasks.filter(
      (t) => t.status === "executing" || t.status === "planning" || t.status === "queued"
    );
    const completedTasks = allTasks.filter((t) => t.status === "completed");
    const totalTasks = allTasks.length;

    const successRate = totalTasks > 0 
      ? Math.round((completedTasks.length / totalTasks) * 100)
      : 0;

    const avgTime = completedTasks.length > 0
      ? completedTasks.reduce((acc, task) => {
          const created = new Date(task.createdAt).getTime();
          const updated = new Date(task.updatedAt).getTime();
          return acc + (updated - created) / 1000 / 60;
        }, 0) / completedTasks.length
      : 0;

    const events = await storage.getAllEvents();
    const todayEvents = events.filter((e) => {
      const eventDate = new Date(e.timestamp);
      const today = new Date();
      return eventDate.toDateString() === today.toDateString();
    });

    res.json({
      activeTasks: activeTasks.length,
      successRate: `${successRate}%`,
      avgTime: `${avgTime.toFixed(1)}m`,
      webhooks: todayEvents.length,
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to broadcast logs to SSE clients
function broadcastLog(taskId: string, log: LogEntry) {
  const clients = sseClients.get(taskId);
  if (clients) {
    const data = JSON.stringify(log);
    clients.forEach((client) => {
      client.write(`data: ${data}\n\n`);
    });
  }
}

// Helper function to add log and broadcast
async function addLog(taskId: string, level: LogEntry["level"], message: string) {
  const log: LogEntry = {
    id: randomUUID(),
    timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
    level,
    message,
  };
  await storage.addTaskLog(taskId, log);
  broadcastLog(taskId, log);
}

// Task processing simulation
async function processTask(taskId: string, steps: string[]) {
  await addLog(taskId, "info", `Task ${taskId} started`);
  
  // Update to planning
  await storage.updateTask(taskId, { status: "planning", progress: 10 });
  await addLog(taskId, "info", "Analyzing task requirements...");

  // Add reasoning steps
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (aiService) {
      try {
        const reasoning = await aiService.explainReasoning(step, `Step ${i + 1} of ${steps.length}`);
        const reasoningStep: ReasoningStep = {
          id: randomUUID(),
          timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
          description: reasoning.description,
          confidence: reasoning.confidence,
          completed: true,
        };
        await storage.addTaskReasoning(taskId, reasoningStep);
        await addLog(taskId, "success", `Reasoning: ${reasoning.description}`);
      } catch (error) {
        await addLog(taskId, "warn", `Could not generate reasoning for: ${step}`);
      }
    }

    await storage.updateTask(taskId, {
      progress: 10 + Math.round((i / steps.length) * 40),
    });
  }

  // Execute
  await storage.updateTask(taskId, { status: "executing", progress: 50 });
  await addLog(taskId, "info", "Executing planned changes...");

  await new Promise((resolve) => setTimeout(resolve, 2000));
  await addLog(taskId, "success", "Simulated code modifications applied");
  await storage.updateTask(taskId, { progress: 80 });

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await addLog(taskId, "info", "Running test suite...");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await addLog(taskId, "success", "All tests passed (simulation)");

  // Complete
  await storage.updateTask(taskId, { status: "completed", progress: 100 });
  await addLog(taskId, "success", "Task completed successfully");
}
