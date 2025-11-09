import type {
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPPromptTemplate,
  MCPToolExecutionResult,
} from "@shared/schema";
import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

interface MCPServerCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

export class MCPClient {
  private config: MCPServerConfig;
  private process?: ChildProcess;
  private messageBuffer: string = "";
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = new Map();
  private requestIdCounter: number = 0;
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private promptTemplates: MCPPromptTemplate[] = [];
  private capabilities?: MCPServerCapabilities;
  private initialized: boolean = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async initialize(): Promise<MCPInitializeResult> {
    if (this.initialized) {
      throw new Error("MCP client already initialized");
    }

    if (this.config.command) {
      this.process = spawn(this.config.command, this.config.args || [], {
        env: { ...process.env, ...this.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        throw new Error("Failed to establish MCP server process streams");
      }

      this.process.stdout.on("data", (data: Buffer) => {
        this.handleStdout(data.toString());
      });

      this.process.stderr.on("data", (data: Buffer) => {
        console.error(`[MCP ${this.config.name}] stderr:`, data.toString());
      });

      this.process.on("error", (error) => {
        console.error(`[MCP ${this.config.name}] Process error:`, error);
        this.rejectAllPendingRequests(error);
      });

      this.process.on("exit", (code, signal) => {
        console.log(`[MCP ${this.config.name}] Process exited: code=${code}, signal=${signal}`);
        this.rejectAllPendingRequests(new Error(`Process exited with code ${code}`));
      });
    }

    const initResult = await this.sendRequest<MCPInitializeResult>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
      },
      clientInfo: {
        name: "ai-github-agent",
        version: "1.0.0",
      },
    });

    this.capabilities = initResult.capabilities;
    this.initialized = true;

    await this.sendNotification("initialized", {});

    if (this.capabilities?.tools) {
      await this.refreshTools();
    }

    if (this.capabilities?.resources) {
      await this.refreshResources();
    }

    if (this.capabilities?.prompts) {
      await this.refreshPromptTemplates();
    }

    return initResult;
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.capabilities?.tools) {
      return [];
    }
    return this.tools;
  }

  async callTool(toolName: string, params?: Record<string, any>): Promise<MCPToolExecutionResult> {
    if (!this.initialized) {
      throw new Error("MCP client not initialized. Call initialize() first.");
    }

    if (!this.capabilities?.tools) {
      throw new Error("MCP server does not support tools");
    }

    const startTime = Date.now();
    try {
      const result = await this.sendRequest("tools/call", {
        name: toolName,
        arguments: params || {},
      });

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result: result.content || result,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error.message || "Tool execution failed",
        executionTime,
      };
    }
  }

  async getResources(): Promise<MCPResource[]> {
    if (!this.capabilities?.resources) {
      return [];
    }
    return this.resources;
  }

  async readResource(uri: string): Promise<any> {
    if (!this.initialized) {
      throw new Error("MCP client not initialized. Call initialize() first.");
    }

    if (!this.capabilities?.resources) {
      throw new Error("MCP server does not support resources");
    }

    const result = await this.sendRequest("resources/read", { uri });
    return result.contents;
  }

  async getPromptTemplates(): Promise<MCPPromptTemplate[]> {
    if (!this.capabilities?.prompts) {
      return [];
    }
    return this.promptTemplates;
  }

  async getPromptTemplate(name: string, args?: Record<string, string>): Promise<any> {
    if (!this.initialized) {
      throw new Error("MCP client not initialized. Call initialize() first.");
    }

    if (!this.capabilities?.prompts) {
      throw new Error("MCP server does not support prompts");
    }

    const result = await this.sendRequest("prompts/get", {
      name,
      arguments: args || {},
    });

    return result.messages;
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }

    this.rejectAllPendingRequests(new Error("MCP client closed"));
    this.initialized = false;
    this.tools = [];
    this.resources = [];
    this.promptTemplates = [];
    this.capabilities = undefined;
  }

  private async refreshTools(): Promise<void> {
    try {
      const result = await this.sendRequest<{ tools: MCPTool[] }>("tools/list", {});
      this.tools = result.tools || [];
    } catch (error) {
      console.error(`[MCP ${this.config.name}] Failed to refresh tools:`, error);
      this.tools = [];
    }
  }

  private async refreshResources(): Promise<void> {
    try {
      const result = await this.sendRequest<{ resources: MCPResource[] }>("resources/list", {});
      this.resources = result.resources || [];
    } catch (error) {
      console.error(`[MCP ${this.config.name}] Failed to refresh resources:`, error);
      this.resources = [];
    }
  }

  private async refreshPromptTemplates(): Promise<void> {
    try {
      const result = await this.sendRequest<{ prompts: MCPPromptTemplate[] }>("prompts/list", {});
      this.promptTemplates = result.prompts || [];
    } catch (error) {
      console.error(`[MCP ${this.config.name}] Failed to refresh prompts:`, error);
      this.promptTemplates = [];
    }
  }

  private async sendRequest<T = any>(method: string, params?: any): Promise<T> {
    const id = ++this.requestIdCounter;
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request) + "\n";
      
      if (this.process?.stdin) {
        this.process.stdin.write(message);
      } else {
        this.pendingRequests.delete(id);
        reject(new Error("MCP server process not running"));
      }

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private async sendNotification(method: string, params?: any): Promise<void> {
    const notification: JSONRPCNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const message = JSON.stringify(notification) + "\n";

    if (this.process?.stdin) {
      this.process.stdin.write(message);
    } else {
      throw new Error("MCP server process not running");
    }
  }

  private handleStdout(data: string): void {
    this.messageBuffer += data;

    const lines = this.messageBuffer.split("\n");
    this.messageBuffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error(`[MCP ${this.config.name}] Failed to parse message:`, line, error);
        }
      }
    }
  }

  private handleMessage(message: JSONRPCResponse | JSONRPCNotification): void {
    if ("id" in message) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else {
      this.handleNotification(message as JSONRPCNotification);
    }
  }

  private handleNotification(notification: JSONRPCNotification): void {
    console.log(`[MCP ${this.config.name}] Notification:`, notification.method, notification.params);

    switch (notification.method) {
      case "tools/list_changed":
        this.refreshTools().catch(console.error);
        break;
      case "resources/list_changed":
        this.refreshResources().catch(console.error);
        break;
      case "prompts/list_changed":
        this.refreshPromptTemplates().catch(console.error);
        break;
    }
  }

  private rejectAllPendingRequests(error: Error): void {
    for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCapabilities(): MCPServerCapabilities | undefined {
    return this.capabilities;
  }
}

export class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map();

  async createClient(id: string, config: MCPServerConfig): Promise<MCPClient> {
    if (this.clients.has(id)) {
      throw new Error(`MCP client with id ${id} already exists`);
    }

    const client = new MCPClient(config);
    await client.initialize();
    this.clients.set(id, client);

    return client;
  }

  getClient(id: string): MCPClient | undefined {
    return this.clients.get(id);
  }

  getAllClients(): Map<string, MCPClient> {
    return new Map(this.clients);
  }

  async closeClient(id: string): Promise<boolean> {
    const client = this.clients.get(id);
    if (!client) {
      return false;
    }

    await client.close();
    this.clients.delete(id);
    return true;
  }

  async closeAllClients(): Promise<void> {
    const closePromises = Array.from(this.clients.keys()).map(id => this.closeClient(id));
    await Promise.all(closePromises);
  }

  /**
   * Alias for createClient (for compatibility)
   */
  async addServer(config: MCPServerConfig): Promise<MCPClient> {
    const id = config.name || `mcp-${Date.now()}`;
    return this.createClient(id, config);
  }

  listClients(): Array<{ id: string; config: MCPServerConfig; initialized: boolean }> {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      config: client.getConfig(),
      initialized: client.isInitialized(),
    }));
  }
}
