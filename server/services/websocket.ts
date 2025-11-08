import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type {
  WSMessage,
  WSTaskUpdate,
  WSLogAdded,
  WSReasoningAdded,
  WSDiffCreated,
  WSRunnerStatus,
  LogEntry,
  ReasoningStep,
  FileDiff,
  TaskStatus,
} from "@shared/schema";

interface WebSocketClient {
  ws: WebSocket;
  id: string;
  subscribedTasks: Set<string>;
  isAlive: boolean;
  lastPing: number;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 30000;
  private readonly PING_TIMEOUT = 5000;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: "/ws",
    });

    this.setupWebSocketServer();
    this.startPingInterval();
  }

  private setupWebSocketServer() {
    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        ws,
        id: clientId,
        subscribedTasks: new Set(),
        isAlive: true,
        lastPing: Date.now(),
      };

      this.clients.set(clientId, client);
      console.log(`[WebSocket] Client connected: ${clientId}`);

      ws.on("message", (data: Buffer) => {
        this.handleMessage(clientId, data);
      });

      ws.on("pong", () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.isAlive = true;
          client.lastPing = Date.now();
        }
      });

      ws.on("close", () => {
        console.log(`[WebSocket] Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on("error", (error) => {
        console.error(`[WebSocket] Client error ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      this.sendMessage(ws, {
        type: "ping",
        timestamp: Date.now(),
      });
    });

    this.wss.on("error", (error) => {
      console.error("[WebSocket] Server error:", error);
    });
  }

  private handleMessage(clientId: string, data: Buffer) {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      
      if (!client) return;

      if (message.type === "subscribe" && message.taskId) {
        client.subscribedTasks.add(message.taskId);
        console.log(`[WebSocket] Client ${clientId} subscribed to task ${message.taskId}`);
      } else if (message.type === "unsubscribe" && message.taskId) {
        client.subscribedTasks.delete(message.taskId);
        console.log(`[WebSocket] Client ${clientId} unsubscribed from task ${message.taskId}`);
      } else if (message.type === "pong") {
        client.isAlive = true;
        client.lastPing = Date.now();
      }
    } catch (error) {
      console.error(`[WebSocket] Error handling message from ${clientId}:`, error);
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          console.log(`[WebSocket] Terminating inactive client: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        client.isAlive = false;
        client.ws.ping();
        
        this.sendMessage(client.ws, {
          type: "ping",
          timestamp: Date.now(),
        });
      });
    }, this.PING_INTERVAL);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private sendMessage(ws: WebSocket, message: WSMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("[WebSocket] Error sending message:", error);
      }
    }
  }

  private broadcast(message: WSMessage, taskId?: string) {
    this.clients.forEach((client) => {
      if (!taskId || client.subscribedTasks.has(taskId) || client.subscribedTasks.size === 0) {
        this.sendMessage(client.ws, message);
      }
    });
  }

  public broadcastTaskUpdate(
    taskId: string,
    status?: TaskStatus,
    progress?: number,
    updates?: Record<string, any>
  ) {
    const message: WSTaskUpdate = {
      type: "task_update",
      taskId,
      status,
      progress,
      updates,
    };
    this.broadcast(message, taskId);
  }

  public broadcastLogAdded(taskId: string, log: LogEntry) {
    const message: WSLogAdded = {
      type: "log_added",
      taskId,
      log,
    };
    this.broadcast(message, taskId);
  }

  public broadcastReasoningAdded(taskId: string, step: ReasoningStep) {
    const message: WSReasoningAdded = {
      type: "reasoning_added",
      taskId,
      step,
    };
    this.broadcast(message, taskId);
  }

  public broadcastDiffCreated(taskId: string, diff: FileDiff) {
    const message: WSDiffCreated = {
      type: "diff_created",
      taskId,
      diff,
    };
    this.broadcast(message, taskId);
  }

  public broadcastRunnerStatus(
    taskId: string,
    runnerId: string,
    status: string,
    metadata?: Record<string, any>
  ) {
    const message: WSRunnerStatus = {
      type: "runner_status",
      taskId,
      runnerId,
      status,
      metadata,
    };
    this.broadcast(message, taskId);
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }

  public getClientsByTask(taskId: string): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.subscribedTasks.has(taskId)) {
        count++;
      }
    });
    return count;
  }

  public close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.clients.forEach((client) => {
      client.ws.close();
    });
    
    this.wss.close();
    console.log("[WebSocket] Server closed");
  }
}
