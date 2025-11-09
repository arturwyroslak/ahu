import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AIService } from "./services/ai";
import { GitHubService } from "./services/github";
import { RepositoryContextService } from "./services/repository-context";
import { MCPClientManager } from "./services/mcp-client";
import { MemoryManager } from "./services/memory-manager";
import { AdvancedPromptEngineer } from "./services/advanced-prompt-engineering";
import { ContainerRunnerService } from "./services/container-runner";
import { SessionManager } from "./services/session-manager";
import {
  insertTaskSchema,
  insertGithubEventSchema,
  settingsSchema,
  mcpServerConfigSchema,
  mcpToolExecutionRequestSchema,
  insertMCPConnectionSchema,
  type LogEntry,
  type ReasoningStep,
} from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

// SSE clients for real-time log streaming
const sseClients = new Map<string, Set<any>>();

let aiService: AIService | null = null;
let githubService: GitHubService | null = null;
let repositoryContextService: RepositoryContextService | null = null;
let memoryManager: MemoryManager | null = null;
let promptEngineer: AdvancedPromptEngineer | null = null;
let containerRunner: ContainerRunnerService | null = null;
let sessionManager: SessionManager | null = null;
const mcpClientManager = new MCPClientManager();

// Initialize services with settings if available
async function initializeServices() {
  const settings = await storage.getSettings();
  if (settings?.ai) {
    aiService = new AIService(settings.ai, storage, mcpClientManager);
  }
  if (settings?.github) {
    githubService = new GitHubService(settings.github);
  }
  if (githubService) {
    memoryManager = new MemoryManager(storage, githubService, aiService || undefined);
    repositoryContextService = new RepositoryContextService(storage, githubService, aiService || undefined);
  }
  
  // Initialize session manager
  sessionManager = new SessionManager(storage, 3600); // 1 hour TTL
  
  // Initialize advanced prompt engineering
  promptEngineer = new AdvancedPromptEngineer(memoryManager || undefined, mcpClientManager);
  
  // Initialize container runner service
  containerRunner = new ContainerRunnerService();
  
  // Setup container runner event handlers
  if (containerRunner) {
    containerRunner.on("runner:log", async ({ runnerId, log }) => {
      // Broadcast logs to SSE clients
      const runner = containerRunner!.getRunner(runnerId);
      if (runner && sseClients.has(runner.taskId)) {
        const clients = sseClients.get(runner.taskId);
        clients?.forEach(client => {
          client.write(`data: ${JSON.stringify({ type: "container_log", data: log })}\n\n`);
        });
      }
    });

    containerRunner.on("runner:stats", async ({ runnerId, stats }) => {
      const runner = containerRunner!.getRunner(runnerId);
      if (runner && sseClients.has(runner.taskId)) {
        const clients = sseClients.get(runner.taskId);
        clients?.forEach(client => {
          client.write(`data: ${JSON.stringify({ type: "container_stats", data: stats })}\n\n`);
        });
      }
    });
  }
  
  // Setup session manager event handlers
  if (sessionManager) {
    sessionManager.on("session:created", (session) => {
      console.log(`Session created: ${session.sessionId}`);
    });

    sessionManager.on("timeline:event", (event) => {
      // Broadcast timeline events to SSE clients
      const session = sessionManager!.getSession(event.sessionId);
      if (session && sseClients.has(session.taskId)) {
        const clients = sseClients.get(session.taskId);
        clients?.forEach(client => {
          client.write(`data: ${JSON.stringify({ type: "timeline_event", data: event })}\n\n`);
        });
      }
    });
  }
  
  // Load MCP servers from config
  try {
    const mcpConfigPath = path.join(process.cwd(), "mcp-config.json");
    const mcpConfigContent = await fs.readFile(mcpConfigPath, "utf-8");
    const mcpConfig = JSON.parse(mcpConfigContent);
    
    if (mcpConfig.mcpEnabled && mcpConfig.mcpServers) {
      for (const serverConfig of mcpConfig.mcpServers) {
        // Skip disabled servers
        if (serverConfig.enabled === false) {
          console.log(`Skipping disabled MCP server: ${serverConfig.name}`);
          continue;
        }
        
        try {
          await mcpClientManager.addServer(serverConfig);
          console.log(`MCP Server initialized: ${serverConfig.name}`);
        } catch (error) {
          console.error(`Failed to initialize MCP server ${serverConfig.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.log("MCP config not found or invalid, skipping MCP initialization");
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

  // === DIFF ENDPOINTS ===
  app.get("/api/tasks/:id/diffs", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task.diffs || []);
    } catch (error: any) {
      console.error("Error getting diffs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks/:id/diffs/apply", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (!githubService) {
        return res.status(503).json({ error: "GitHub service not initialized. Please configure GitHub settings." });
      }

      if (!task.diffs || task.diffs.length === 0) {
        return res.status(400).json({ error: "No diffs to apply for this task" });
      }

      const { repository, branch } = task;
      const [owner, repo] = repository.split("/");

      if (!owner || !repo) {
        return res.status(400).json({ error: "Invalid repository format" });
      }

      const results = [];
      for (const diff of task.diffs) {
        try {
          const currentContent = await githubService.getFileContent(owner, repo, diff.path, branch);
          
          if (aiService) {
            const validation = await aiService.validateDiffSafety(diff, currentContent);
            
            if (!validation.safe) {
              results.push({
                path: diff.path,
                success: false,
                error: `Safety validation failed: ${validation.issues.join(", ")}`,
                warnings: validation.warnings,
              });
              continue;
            }
          }

          await addLog(task.id, "info", `Applying diff to ${diff.path}...`);
          results.push({
            path: diff.path,
            success: true,
            message: "Diff validated and ready to apply (actual GitHub commit not implemented)",
          });
        } catch (error: any) {
          console.error(`Error applying diff for ${diff.path}:`, error);
          results.push({
            path: diff.path,
            success: false,
            error: error.message,
          });
        }
      }

      const allSuccessful = results.every((r) => r.success);
      res.json({
        success: allSuccessful,
        results,
        message: allSuccessful 
          ? "All diffs validated successfully" 
          : "Some diffs failed validation",
      });
    } catch (error: any) {
      console.error("Error applying diffs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks/:id/diffs/validate", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (!githubService) {
        return res.status(503).json({ error: "GitHub service not initialized." });
      }

      if (!task.diffs || task.diffs.length === 0) {
        return res.status(400).json({ error: "No diffs to validate for this task" });
      }

      const { repository, branch } = task;
      const [owner, repo] = repository.split("/");

      if (!owner || !repo) {
        return res.status(400).json({ error: "Invalid repository format" });
      }

      const validations = [];
      for (const diff of task.diffs) {
        try {
          const currentContent = await githubService.getFileContent(owner, repo, diff.path, branch);
          
          let validation: { safe: boolean; issues: string[]; warnings: string[] } = { safe: true, issues: [], warnings: [] };
          if (aiService) {
            validation = await aiService.validateDiffSafety(diff, currentContent);
          }

          validations.push({
            path: diff.path,
            ...validation,
          });
        } catch (error: any) {
          validations.push({
            path: diff.path,
            safe: false,
            issues: [error.message],
            warnings: [],
          });
        }
      }

      const allSafe = validations.every((v) => v.safe);
      res.json({
        safe: allSafe,
        validations,
      });
    } catch (error: any) {
      console.error("Error validating diffs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks/:id/diffs/:diffIndex/explain", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const diffIndex = parseInt(req.params.diffIndex, 10);
      if (isNaN(diffIndex) || diffIndex < 0 || !task.diffs || diffIndex >= task.diffs.length) {
        return res.status(400).json({ error: "Invalid diff index" });
      }

      const diff = task.diffs[diffIndex];

      if (!aiService) {
        return res.status(503).json({ error: "AI service not initialized." });
      }

      const explanation = await aiService.explainDiff(diff);
      res.json(explanation);
    } catch (error: any) {
      console.error("Error explaining diff:", error);
      res.status(500).json({ error: error.message });
    }
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

  // === GITHUB REPOSITORIES ENDPOINT ===
  app.get("/api/github/repositories", async (_req, res) => {
    try {
      if (!githubService) {
        return res.status(503).json({ error: "GitHub service not initialized. Please configure GitHub settings." });
      }
      
      const repositories = await githubService.listUserRepositories();
      res.json(repositories);
    } catch (error: any) {
      console.error("Error fetching repositories:", error);
      res.status(500).json({ error: error.message });
    }
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
        aiService = new AIService(settings.ai, storage);
      }
      if (settings.github) {
        githubService = new GitHubService(settings.github);
      }
      if (githubService) {
        repositoryContextService = new RepositoryContextService(storage, githubService, aiService || undefined);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // === AI PROVIDER ENDPOINTS ===
  app.get("/api/ai/providers", async (_req, res) => {
    try {
      if (!aiService) {
        return res.status(503).json({ error: "AI service not initialized. Please configure AI settings." });
      }

      const providerManager = aiService.getProviderManager();
      if (!providerManager) {
        return res.json([]);
      }

      const providers = providerManager.getProviders();
      res.json(providers);
    } catch (error: any) {
      console.error("Error getting providers:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ai/metrics", async (_req, res) => {
    try {
      if (!aiService) {
        return res.status(503).json({ error: "AI service not initialized. Please configure AI settings." });
      }

      const providerManager = aiService.getProviderManager();
      if (!providerManager) {
        return res.json([]);
      }

      const metrics = providerManager.getMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error("Error getting metrics:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/providers/:name/test", async (req, res) => {
    try {
      const { name } = req.params;

      if (!aiService) {
        return res.status(503).json({ error: "AI service not initialized. Please configure AI settings." });
      }

      const providerManager = aiService.getProviderManager();
      if (!providerManager) {
        return res.status(503).json({ error: "No providers configured" });
      }

      const result = await providerManager.testProvider(name);
      res.json(result);
    } catch (error: any) {
      console.error(`Error testing provider ${req.params.name}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // === REPOSITORY CONTEXT ENDPOINTS ===
  app.get("/api/repositories/:owner/:repo/context", async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const repository = `${owner}/${repo}`;

      if (!repositoryContextService) {
        return res.status(503).json({ error: "Repository context service not initialized. Please configure GitHub settings." });
      }

      const context = await repositoryContextService.getOrCreateContext(repository);
      res.json(context);
    } catch (error: any) {
      console.error("Error getting repository context:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/repositories/:owner/:repo/context/refresh", async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const repository = `${owner}/${repo}`;

      if (!repositoryContextService) {
        return res.status(503).json({ error: "Repository context service not initialized. Please configure GitHub settings." });
      }

      const context = await repositoryContextService.refreshContext(repository);
      res.json(context);
    } catch (error: any) {
      console.error("Error refreshing repository context:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/repositories/:owner/:repo/context/summary", async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const repository = `${owner}/${repo}`;

      if (!repositoryContextService) {
        return res.status(503).json({ error: "Repository context service not initialized. Please configure GitHub settings." });
      }

      const summary = await repositoryContextService.getSemanticSummary(repository);
      res.json({ summary });
    } catch (error: any) {
      console.error("Error getting semantic summary:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // === MCP SERVER ENDPOINTS ===
  app.post("/api/mcp/servers", async (req, res) => {
    try {
      const serverConfig = mcpServerConfigSchema.parse(req.body);

      const connection = await storage.createMCPConnection({
        type: serverConfig.type,
        name: serverConfig.name,
        config: serverConfig as any,
        status: "initializing",
      });

      try {
        const client = await mcpClientManager.createClient(connection.id, serverConfig);
        
        await storage.updateMCPConnection(connection.id, {
          status: "connected",
          lastUsed: new Date().toISOString(),
        });

        res.json({
          ...connection,
          status: "connected",
          capabilities: client.getCapabilities(),
        });
      } catch (error: any) {
        await storage.updateMCPConnection(connection.id, {
          status: "error",
        });
        
        throw error;
      }
    } catch (error: any) {
      console.error("Error creating MCP server:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/mcp/servers", async (_req, res) => {
    try {
      const connections = await storage.getAllMCPConnections();
      
      const connectionsWithStatus = connections.map((conn) => {
        const client = mcpClientManager.getClient(conn.id);
        return {
          ...conn,
          initialized: client?.isInitialized() || false,
          capabilities: client?.getCapabilities(),
        };
      });

      res.json(connectionsWithStatus);
    } catch (error: any) {
      console.error("Error listing MCP servers:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/mcp/servers/:id", async (req, res) => {
    try {
      const connection = await storage.getMCPConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "MCP server not found" });
      }

      const client = mcpClientManager.getClient(connection.id);
      
      res.json({
        ...connection,
        initialized: client?.isInitialized() || false,
        capabilities: client?.getCapabilities(),
      });
    } catch (error: any) {
      console.error("Error getting MCP server:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/mcp/servers/:id/tools", async (req, res) => {
    try {
      const connection = await storage.getMCPConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "MCP server not found" });
      }

      const client = mcpClientManager.getClient(connection.id);
      if (!client) {
        return res.status(503).json({ error: "MCP server not initialized" });
      }

      const tools = await client.listTools();
      
      await storage.updateMCPConnection(connection.id, {
        lastUsed: new Date().toISOString(),
      });

      res.json({ tools });
    } catch (error: any) {
      console.error("Error listing MCP tools:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/mcp/servers/:id/tools/:toolName", async (req, res) => {
    try {
      const { id, toolName } = req.params;
      
      const connection = await storage.getMCPConnection(id);
      if (!connection) {
        return res.status(404).json({ error: "MCP server not found" });
      }

      const client = mcpClientManager.getClient(id);
      if (!client) {
        return res.status(503).json({ error: "MCP server not initialized" });
      }

      const executionRequest = mcpToolExecutionRequestSchema.parse({
        toolName,
        params: req.body,
      });

      const result = await client.callTool(executionRequest.toolName, executionRequest.params);

      await storage.updateMCPConnection(id, {
        lastUsed: new Date().toISOString(),
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error executing MCP tool:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/mcp/servers/:id/resources", async (req, res) => {
    try {
      const connection = await storage.getMCPConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "MCP server not found" });
      }

      const client = mcpClientManager.getClient(connection.id);
      if (!client) {
        return res.status(503).json({ error: "MCP server not initialized" });
      }

      const resources = await client.getResources();

      await storage.updateMCPConnection(connection.id, {
        lastUsed: new Date().toISOString(),
      });

      res.json({ resources });
    } catch (error: any) {
      console.error("Error listing MCP resources:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/mcp/servers/:id/prompts", async (req, res) => {
    try {
      const connection = await storage.getMCPConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "MCP server not found" });
      }

      const client = mcpClientManager.getClient(connection.id);
      if (!client) {
        return res.status(503).json({ error: "MCP server not initialized" });
      }

      const prompts = await client.getPromptTemplates();

      await storage.updateMCPConnection(connection.id, {
        lastUsed: new Date().toISOString(),
      });

      res.json({ prompts });
    } catch (error: any) {
      console.error("Error listing MCP prompts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/mcp/servers/:id", async (req, res) => {
    try {
      const connection = await storage.getMCPConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "MCP server not found" });
      }

      await mcpClientManager.closeClient(connection.id);
      
      const deleted = await storage.deleteMCPConnection(connection.id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Failed to delete MCP server" });
      }

      res.json({ success: true, message: "MCP server deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting MCP server:", error);
      res.status(500).json({ error: error.message });
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
  // === SYSTEM STATUS ENDPOINT ===
  app.get("/api/system/status", async (_req, res) => {
    try {
      const mcpClients = mcpClientManager.listClients();
      const activeSessions = sessionManager?.getActiveSessions() || [];
      
      const status = {
        mcpServers: mcpClients.map(client => ({
          name: client.id,
          status: client.initialized ? "connected" : "disconnected",
          toolsCount: 0, // Will be populated from MCP client
        })),
        containerRunner: {
          available: containerRunner !== null,
          activeContainers: containerRunner?.getActiveRunners().length || 0,
          totalCapacity: 10,
        },
        memory: {
          used: process.memoryUsage().heapUsed / 1024 / 1024,
          total: process.memoryUsage().heapTotal / 1024 / 1024,
          unit: "MB",
        },
        sessions: {
          active: activeSessions.length,
          cached: 0,
        },
      };
      
      res.json(status);
    } catch (error) {
      console.error("Error fetching system status:", error);
      res.status(500).json({ error: "Failed to fetch system status" });
    }
  });

  // === SESSION TIMELINE ENDPOINT ===
  app.get("/api/sessions/timeline/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      
      // Get recent timeline events from session manager
      const events = sessionManager?.getRecentTimelineEvents(limit) || [];
      
      res.json(events);
    } catch (error) {
      console.error("Error fetching timeline events:", error);
      res.status(500).json({ error: "Failed to fetch timeline events" });
    }
  });

  // === MCP TOOLS ENDPOINT ===
  app.get("/api/mcp/tools", async (_req, res) => {
    try {
      const clients = mcpClientManager.listClients();
      const allTools: any[] = [];
      
      for (const client of clients) {
        const mcpClient = mcpClientManager.getClient(client.id);
        if (mcpClient) {
          const tools = await mcpClient.listTools();
          tools.forEach(tool => {
            allTools.push({
              name: tool.name,
              description: tool.description || "",
              server: client.id,
              category: categorizeTool(tool.name),
              parameters: tool.inputSchema?.properties 
                ? Object.entries(tool.inputSchema.properties).map(([name, schema]: [string, any]) => ({
                    name,
                    type: schema.type || "string",
                    required: tool.inputSchema?.required?.includes(name) || false,
                  }))
                : [],
            });
          });
        }
      }
      
      res.json(allTools);
    } catch (error) {
      console.error("Error fetching MCP tools:", error);
      res.status(500).json({ error: "Failed to fetch MCP tools" });
    }
  });

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

// Helper function to categorize MCP tools
function categorizeTool(toolName: string): string {
  const name = toolName.toLowerCase();
  
  if (name.includes("repository") || name.includes("repo") || name.includes("fork")) {
    return "repository";
  }
  if (name.includes("code") || name.includes("file") || name.includes("search")) {
    return "code";
  }
  if (name.includes("issue")) {
    return "issue";
  }
  if (name.includes("pull") || name.includes("pr") || name.includes("review")) {
    return "pr";
  }
  if (name.includes("workflow") || name.includes("action")) {
    return "workflow";
  }
  if (name.includes("playwright") || name.includes("browser") || name.includes("navigate") || name.includes("screenshot")) {
    return "browser";
  }
  
  return "other";
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
