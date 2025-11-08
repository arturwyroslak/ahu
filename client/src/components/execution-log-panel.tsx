import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Unlock } from "lucide-react";
import { useState, useEffect, useRef } from "react";

type LogLevel = "info" | "warn" | "error" | "success";

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

interface ExecutionLogPanelProps {
  logs: LogEntry[];
  title?: string;
}

const levelStyles = {
  info: "text-foreground",
  warn: "text-chart-3",
  error: "text-destructive",
  success: "text-chart-2",
};

export function ExecutionLogPanel({ logs, title = "Execution Log" }: ExecutionLogPanelProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <Card className="flex flex-col h-full" data-testid="card-execution-log">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
          data-testid="button-toggle-autoscroll"
        >
          {autoScroll ? (
            <>
              <Lock className="h-3 w-3 mr-1" />
              Auto-scroll
            </>
          ) : (
            <>
              <Unlock className="h-3 w-3 mr-1" />
              Scroll unlocked
            </>
          )}
        </Button>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto font-mono text-xs leading-relaxed"
          data-testid="text-log-content"
        >
          {logs.map((log, index) => (
            <div
              key={log.id}
              className="flex gap-3 px-6 py-1 hover-elevate"
              data-testid={`log-entry-${index}`}
            >
              <span className="text-muted-foreground w-12 flex-shrink-0 text-right">
                {index + 1}
              </span>
              <span className="text-muted-foreground w-20 flex-shrink-0">
                {log.timestamp}
              </span>
              <span className={`flex-1 ${levelStyles[log.level]}`}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
