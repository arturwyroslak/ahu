import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ExecutionLogPanel } from "@/components/execution-log-panel";
import { AIReasoningChain } from "@/components/ai-reasoning-chain";
import { DiffViewer } from "@/components/diff-viewer";
import { ArrowLeft, GitBranch, Calendar } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTaskWebSocket } from "@/hooks/use-websocket";
import type { Task, LogEntry } from "@shared/schema";
import { useMemo } from "react";

export default function TaskDetail() {
  const [, params] = useRoute("/task/:id");
  const taskId = params?.id || "";

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ["/api/tasks", taskId],
    enabled: !!taskId,
  });

  // Fetch historical logs from API
  const { data: historicalLogs = [] } = useQuery<LogEntry[]>({
    queryKey: ["/api/tasks", taskId, "logs"],
    enabled: !!taskId,
  });

  // WebSocket subscription for real-time updates (replaces SSE)
  useTaskWebSocket(taskId);

  // Merge historical logs with live WebSocket logs, de-duplicate, and sort by timestamp
  const allLogs = useMemo(() => {
    const liveLogs = task?.logs || [];
    const existingKeys = new Set<string>();
    const dedupedLogs: LogEntry[] = [];

    // Helper to generate composite key
    const getLogKey = (log: LogEntry) => 
      log.id ?? `${log.timestamp}-${log.message}`;

    // First pass: deduplicate historical logs
    for (const log of historicalLogs) {
      const key = getLogKey(log);
      if (!existingKeys.has(key)) {
        dedupedLogs.push(log);
        existingKeys.add(key);
      }
    }

    // Second pass: merge live logs, skipping duplicates
    for (const log of liveLogs) {
      const key = getLogKey(log);
      if (!existingKeys.has(key)) {
        dedupedLogs.push(log);
        existingKeys.add(key);
      }
    }

    // Sort by timestamp chronologically (oldest first)
    return dedupedLogs.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : Number.POSITIVE_INFINITY;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : Number.POSITIVE_INFINITY;
      return timeA - timeB;
    });
  }, [historicalLogs, task?.logs]);

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (isLoading || !task) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading task...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          data-testid="button-back"
        >
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-xl" data-testid="text-task-title">
                {task.title}
              </CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  <span>{task.repository}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Started {formatTimestamp(task.createdAt)}</span>
                </div>
              </div>
            </div>
            <StatusBadge status={task.status} />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">
            {task.summary}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-[500px]">
            <ExecutionLogPanel logs={allLogs} />
          </div>
          {(task.diffs || []).length > 0 && <DiffViewer files={task.diffs || []} />}
        </div>

        <div className="space-y-6">
          {(task.reasoning || []).length > 0 && (
            <AIReasoningChain steps={task.reasoning || []} />
          )}
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Repository Context</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">Repository</div>
                  <div className="font-mono">{task.repository}</div>
                </div>
                {task.branch && (
                  <div>
                    <div className="text-muted-foreground mb-1">Branch</div>
                    <div className="font-mono">{task.branch}</div>
                  </div>
                )}
                <div>
                  <div className="text-muted-foreground mb-1">Progress</div>
                  <div>{task.progress}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Status</div>
                  <div className="capitalize">{task.status}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
