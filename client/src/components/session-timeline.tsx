import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GitBranch,
  GitPullRequest,
  FileCode,
  Terminal,
  Brain,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface TimelineEvent {
  id: string;
  sessionId: string;
  type: "task_start" | "reasoning" | "tool_execution" | "code_change" | "pr_created" | "completed" | "error";
  timestamp: string;
  description: string;
  metadata?: Record<string, any>;
}

interface SessionTimelineProps {
  sessionId?: string;
  limit?: number;
}

export function SessionTimeline({ sessionId, limit = 20 }: SessionTimelineProps) {
  const { data: events = [], isLoading, error } = useQuery<TimelineEvent[]>({
    queryKey: sessionId ? ["/api/sessions", sessionId, "timeline"] : ["/api/sessions/timeline/recent"],
    refetchInterval: 3000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load timeline events. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  const getEventIcon = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "task_start":
        return <Clock className="h-4 w-4" />;
      case "reasoning":
        return <Brain className="h-4 w-4" />;
      case "tool_execution":
        return <Terminal className="h-4 w-4" />;
      case "code_change":
        return <FileCode className="h-4 w-4" />;
      case "pr_created":
        return <GitPullRequest className="h-4 w-4" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "error":
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "task_start":
        return "text-blue-500 bg-blue-500/10";
      case "reasoning":
        return "text-purple-500 bg-purple-500/10";
      case "tool_execution":
        return "text-cyan-500 bg-cyan-500/10";
      case "code_change":
        return "text-orange-500 bg-orange-500/10";
      case "pr_created":
        return "text-green-500 bg-green-500/10";
      case "completed":
        return "text-green-500 bg-green-500/10";
      case "error":
        return "text-red-500 bg-red-500/10";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <Card data-testid="card-session-timeline">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          {sessionId ? "Session Timeline" : "Recent Activity"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] px-6 pb-6">
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No timeline events yet
            </div>
          ) : (
            <div className="space-y-4">
              {events.slice(0, limit).map((event, index) => (
                <div
                  key={event.id}
                  className="flex gap-3 relative"
                  data-testid={`timeline-event-${event.id}`}
                >
                  {/* Timeline line */}
                  {index < events.length - 1 && (
                    <div className="absolute left-[13px] top-8 w-[2px] h-full bg-border" />
                  )}
                  
                  {/* Event icon */}
                  <div className={`relative z-10 flex items-center justify-center h-7 w-7 rounded-full ${getEventColor(event.type)}`}>
                    {getEventIcon(event.type)}
                  </div>

                  {/* Event content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {event.description}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {event.metadata.tool && (
                          <Badge variant="outline" className="text-xs mr-1">
                            {event.metadata.tool}
                          </Badge>
                        )}
                        {event.metadata.repository && (
                          <span className="text-xs text-muted-foreground">
                            {event.metadata.repository}
                          </span>
                        )}
                        {event.metadata.duration && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {event.metadata.duration}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
