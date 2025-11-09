import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { wsManager } from "@/lib/websocket";
import type { WSMessage, Task, LogEntry, ReasoningStep, FileDiff } from "@shared/schema";

/**
 * Hook to get WebSocket connection status
 */
export function useWebSocketStatus() {
  const [isConnected, setIsConnected] = useState(wsManager.isConnected());
  const [readyState, setReadyState] = useState(wsManager.getReadyState());

  useEffect(() => {
    const updateStatus = () => {
      setIsConnected(wsManager.isConnected());
      setReadyState(wsManager.getReadyState());
    };

    const unsubConnect = wsManager.onConnect(updateStatus);
    const unsubDisconnect = wsManager.onDisconnect(updateStatus);

    // Initial status check
    updateStatus();

    // Poll for status updates (as backup)
    const interval = setInterval(updateStatus, 1000);

    return () => {
      unsubConnect();
      unsubDisconnect();
      clearInterval(interval);
    };
  }, []);

  return { isConnected, readyState };
}

/**
 * Hook to subscribe to WebSocket messages
 */
export function useWebSocketSubscription(
  handler: (message: WSMessage) => void,
  dependencies: any[] = []
) {
  const handlerRef = useRef(handler);

  // Update ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const wrappedHandler = (message: WSMessage) => {
      handlerRef.current(message);
    };

    const unsubscribe = wsManager.subscribe({
      handler: wrappedHandler,
    });

    return unsubscribe;
  }, dependencies);
}

/**
 * Hook to subscribe to task updates with automatic query cache invalidation
 */
export function useTaskWebSocket(taskId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = wsManager.subscribeToTask(taskId, (message) => {
      switch (message.type) {
        case "task_update":
          // Update task query cache
          queryClient.setQueryData<Task>(["/api/tasks", taskId], (old) => {
            if (!old) return old;
            return {
              ...old,
              ...message.updates,
              status: message.status || old.status,
              progress: message.progress !== undefined ? message.progress : old.progress,
              updatedAt: new Date().toISOString(),
            };
          });
          
          // Invalidate task lists
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tasks/active"] });
          break;

        case "log_added":
          // Add log to task cache
          queryClient.setQueryData<Task>(["/api/tasks", taskId], (old) => {
            if (!old) return old;
            return {
              ...old,
              logs: [...(old.logs || []), message.log],
              updatedAt: new Date().toISOString(),
            };
          });
          break;

        case "reasoning_added":
          // Add reasoning step to task cache
          queryClient.setQueryData<Task>(["/api/tasks", taskId], (old) => {
            if (!old) return old;
            return {
              ...old,
              reasoning: [...(old.reasoning || []), message.step],
              updatedAt: new Date().toISOString(),
            };
          });
          break;

        case "diff_created":
          // Add diff to task cache
          queryClient.setQueryData<Task>(["/api/tasks", taskId], (old) => {
            if (!old) return old;
            return {
              ...old,
              diffs: [...(old.diffs || []), message.diff],
              updatedAt: new Date().toISOString(),
            };
          });
          break;

        case "runner_status":
          // Invalidate system status when runner status changes
          queryClient.invalidateQueries({ queryKey: ["/api/system/status"] });
          break;
      }
    });

    return unsubscribe;
  }, [taskId, queryClient]);
}

/**
 * Hook to get real-time task logs
 */
export function useTaskLogs(taskId: string | undefined) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = wsManager.subscribe({
      taskId,
      messageTypes: ["log_added"],
      handler: (message) => {
        if (message.type === "log_added") {
          setLogs((prev) => [...prev, message.log]);
        }
      },
    });

    return unsubscribe;
  }, [taskId]);

  return logs;
}

/**
 * Hook to get real-time task reasoning steps
 */
export function useTaskReasoning(taskId: string | undefined) {
  const [reasoning, setReasoning] = useState<ReasoningStep[]>([]);

  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = wsManager.subscribe({
      taskId,
      messageTypes: ["reasoning_added"],
      handler: (message) => {
        if (message.type === "reasoning_added") {
          setReasoning((prev) => [...prev, message.step]);
        }
      },
    });

    return unsubscribe;
  }, [taskId]);

  return reasoning;
}

/**
 * Hook to get real-time task diffs
 */
export function useTaskDiffs(taskId: string | undefined) {
  const [diffs, setDiffs] = useState<FileDiff[]>([]);

  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = wsManager.subscribe({
      taskId,
      messageTypes: ["diff_created"],
      handler: (message) => {
        if (message.type === "diff_created") {
          setDiffs((prev) => [...prev, message.diff]);
        }
      },
    });

    return unsubscribe;
  }, [taskId]);

  return diffs;
}

/**
 * Hook to subscribe to task updates and get callback
 */
export function useTaskUpdateCallback(
  taskId: string | undefined,
  onUpdate: (updates: any) => void
) {
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = wsManager.subscribe({
      taskId,
      messageTypes: ["task_update"],
      handler: (message) => {
        if (message.type === "task_update") {
          onUpdateRef.current(message.updates || {});
        }
      },
    });

    return unsubscribe;
  }, [taskId]);
}

/**
 * Hook to connect/disconnect WebSocket on demand
 */
export function useWebSocketConnection() {
  const connect = useCallback(() => {
    wsManager.reconnect();
  }, []);

  const disconnect = useCallback(() => {
    wsManager.disconnect();
  }, []);

  return { connect, disconnect };
}
