import type { WSMessage, WSMessageType } from "@shared/schema";

type MessageHandler = (message: WSMessage) => void;
type ConnectionHandler = () => void;

interface SubscriptionConfig {
  taskId?: string;
  messageTypes?: WSMessageType[];
  handler: MessageHandler;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 3000;
  private readonly PING_INTERVAL = 25000;
  private readonly CONNECTION_TIMEOUT = 10000;

  private subscriptions = new Map<string, SubscriptionConfig>();
  private subscribedTasks = new Set<string>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private disconnectionHandlers = new Set<ConnectionHandler>();
  
  private connectionPromise: Promise<void> | null = null;
  private isManuallyDisconnected = false;

  constructor() {
    // Auto-connect when manager is created
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  async connect(): Promise<void> {
    // Return existing connection promise if already connecting
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Already connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // Prevent connecting if manually disconnected
    if (this.isManuallyDisconnected) {
      return Promise.resolve();
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isConnecting = true;
      const url = this.getWebSocketUrl();
      
      console.log('[WebSocket] Connecting to:', url);
      
      try {
        this.ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          console.warn('[WebSocket] Connection timeout');
          this.ws?.close();
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }, this.CONNECTION_TIMEOUT);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[WebSocket] Connected successfully');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.connectionPromise = null;
          
          // Start ping interval
          this.startPingInterval();
          
          // Resubscribe to tasks
          this.resubscribeToTasks();
          
          // Notify connection handlers
          this.connectionHandlers.forEach(handler => handler());
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[WebSocket] Error:', error);
          this.isConnecting = false;
          this.connectionPromise = null;
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          console.log('[WebSocket] Disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this.connectionPromise = null;
          this.stopPingInterval();
          
          // Notify disconnection handlers
          this.disconnectionHandlers.forEach(handler => handler());
          
          // Attempt to reconnect unless manually disconnected
          if (!this.isManuallyDisconnected && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.scheduleReconnect();
          } else if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error('[WebSocket] Max reconnect attempts reached');
          }
        };
      } catch (error) {
        console.error('[WebSocket] Failed to create WebSocket:', error);
        this.isConnecting = false;
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingInterval() {
    this.stopPingInterval();
    
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, this.PING_INTERVAL);
  }

  private stopPingInterval() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private resubscribeToTasks() {
    // Resubscribe to all previously subscribed tasks
    this.subscribedTasks.forEach(taskId => {
      this.send({ type: 'subscribe', taskId });
    });
  }

  private handleMessage(data: string) {
    try {
      const message: WSMessage = JSON.parse(data);
      
      // Handle pong messages
      if (message.type === 'pong') {
        return;
      }

      // Notify all relevant subscribers
      this.subscriptions.forEach((config, id) => {
        const shouldNotify = 
          (!config.messageTypes || config.messageTypes.includes(message.type)) &&
          (!config.taskId || ('taskId' in message && message.taskId === config.taskId));
        
        if (shouldNotify) {
          try {
            config.handler(message);
          } catch (error) {
            console.error(`[WebSocket] Error in subscription handler ${id}:`, error);
          }
        }
      });
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  private send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send message, not connected');
    }
  }

  /**
   * Subscribe to WebSocket messages with optional filtering
   */
  subscribe(config: SubscriptionConfig): () => void {
    const id = Math.random().toString(36).substring(7);
    this.subscriptions.set(id, config);

    // If subscribing to a specific task, send subscribe message
    if (config.taskId) {
      this.subscribedTasks.add(config.taskId);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'subscribe', taskId: config.taskId });
      }
    }

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(id);
      
      // If no more subscriptions for this task, unsubscribe
      if (config.taskId) {
        const hasOtherSubscriptions = Array.from(this.subscriptions.values())
          .some(sub => sub.taskId === config.taskId);
        
        if (!hasOtherSubscriptions) {
          this.subscribedTasks.delete(config.taskId);
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.send({ type: 'unsubscribe', taskId: config.taskId });
          }
        }
      }
    };
  }

  /**
   * Subscribe to task updates
   */
  subscribeToTask(taskId: string, handler: MessageHandler): () => void {
    return this.subscribe({
      taskId,
      messageTypes: ['task_update', 'log_added', 'reasoning_added', 'diff_created'],
      handler,
    });
  }

  /**
   * Subscribe to specific message types
   */
  subscribeToMessageType(type: WSMessageType, handler: MessageHandler): () => void {
    return this.subscribe({
      messageTypes: [type],
      handler,
    });
  }

  /**
   * Subscribe to connection status changes
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    
    // If already connected, call handler immediately
    if (this.ws?.readyState === WebSocket.OPEN) {
      handler();
    }
    
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to disconnection events
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => {
      this.disconnectionHandlers.delete(handler);
    };
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Manually disconnect
   */
  disconnect() {
    this.isManuallyDisconnected = true;
    this.stopPingInterval();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribedTasks.clear();
    this.subscriptions.clear();
  }

  /**
   * Manually reconnect
   */
  reconnect() {
    this.isManuallyDisconnected = false;
    this.reconnectAttempts = 0;
    this.connect();
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();
export type { MessageHandler, SubscriptionConfig };
