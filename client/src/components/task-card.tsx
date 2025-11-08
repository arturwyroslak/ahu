import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import { Eye, X } from "lucide-react";
import { Link } from "wouter";

type TaskStatus = "planning" | "executing" | "completed" | "failed" | "queued";

interface TaskCardProps {
  id: string;
  title: string;
  status: TaskStatus;
  timestamp: string;
  summary: string;
  progress?: number;
  repository?: string;
}

export function TaskCard({
  id,
  title,
  status,
  timestamp,
  summary,
  progress = 0,
  repository,
}: TaskCardProps) {
  return (
    <Card className="hover-elevate" data-testid={`card-task-${id}`}>
      <CardHeader className="space-y-0 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium truncate" data-testid={`text-task-title-${id}`}>
              {title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {repository && (
                <span className="text-xs text-muted-foreground">{repository}</span>
              )}
              <span className="text-xs text-muted-foreground">{timestamp}</span>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-sm text-foreground line-clamp-2" data-testid={`text-task-summary-${id}`}>
          {summary}
        </p>
        
        {progress > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground">{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 pt-0">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="flex-1"
          data-testid={`button-view-task-${id}`}
        >
          <Link href={`/task/${id}`}>
            <Eye className="h-3 w-3 mr-1" />
            View Details
          </Link>
        </Button>
        {status === "executing" && (
          <Button
            variant="ghost"
            size="sm"
            data-testid={`button-cancel-task-${id}`}
            onClick={() => console.log(`Cancel task ${id}`)}
          >
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
