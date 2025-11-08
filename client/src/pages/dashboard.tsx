import { MetricsCard } from "@/components/metrics-card";
import { TaskCard } from "@/components/task-card";
import { EventLogTable } from "@/components/event-log-table";
import { Activity, CheckCircle, Clock, Webhook } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Task, GithubEvent } from "@shared/schema";

interface Metrics {
  activeTasks: number;
  successRate: string;
  avgTime: string;
  webhooks: number;
}

export default function Dashboard() {
  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks/active"],
  });

  const { data: events = [] } = useQuery<GithubEvent[]>({
    queryKey: ["/api/events/recent"],
  });

  const metricsData = [
    {
      title: "Active Tasks",
      value: metrics?.activeTasks?.toString() || "0",
      icon: Activity,
      trend: "+2 from last hour",
    },
    {
      title: "Success Rate",
      value: metrics?.successRate || "0%",
      icon: CheckCircle,
      trend: "+2% this week",
    },
    {
      title: "Avg Time",
      value: metrics?.avgTime || "0m",
      icon: Clock,
      trend: "-0.5m improvement",
    },
    {
      title: "Webhooks",
      value: metrics?.webhooks?.toString() || "0",
      icon: Webhook,
      trend: "Today",
    },
  ];

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
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor autonomous development workflows and task execution
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricsData.map((metric) => (
          <MetricsCard key={metric.title} {...metric} />
        ))}
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Active Tasks</h2>
        {tasks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No active tasks. Waiting for GitHub webhooks...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                title={task.title}
                status={task.status}
                timestamp={formatTimestamp(task.createdAt)}
                summary={task.summary}
                progress={task.progress}
                repository={task.repository}
              />
            ))}
          </div>
        )}
      </div>

      <EventLogTable events={events.map((e) => ({
        ...e,
        timestamp: formatTimestamp(e.timestamp),
      }))} />
    </div>
  );
}
