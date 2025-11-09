import { Card, CardContent } from "@/components/ui/card";
import { TaskCard } from "@/components/task-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { History as HistoryIcon } from "lucide-react";
import type { Task } from "@shared/schema";

export default function History() {
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const completedTasks = tasks.filter(
    (task) => task.status === "completed" || task.status === "failed"
  );

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">
          History
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          View all completed and failed tasks
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : completedTasks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16 text-muted-foreground">
            <HistoryIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No completed tasks yet</p>
            <p className="text-xs mt-1">Task history will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {completedTasks.map((task) => (
            <TaskCard
              key={task.id}
              id={task.id}
              description={task.description}
              status={task.status}
              timestamp={formatTimestamp(task.createdAt)}
              progress={task.progress}
              repository={task.repository}
            />
          ))}
        </div>
      )}
    </div>
  );
}
