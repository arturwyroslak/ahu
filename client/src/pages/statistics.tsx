import { MetricsCard } from "@/components/metrics-card";
import { EventLogTable } from "@/components/event-log-table";
import { Activity, CheckCircle, Clock, Webhook, TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { GithubEvent } from "@shared/schema";

interface Metrics {
  activeTasks: number;
  successRate: string;
  avgTime: string;
  webhooks: number;
}

export default function Statistics() {
  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["/api/metrics"],
    refetchInterval: 5000,
  });

  const { data: events = [] } = useQuery<GithubEvent[]>({
    queryKey: ["/api/events/recent"],
    refetchInterval: 5000,
  });

  const metricsData = [
    {
      title: "Active Tasks",
      value: metrics?.activeTasks?.toString() || "0",
      icon: Activity,
      trend: "+2 from last hour",
      trendIcon: TrendingUp,
      trendPositive: true,
    },
    {
      title: "Success Rate",
      value: metrics?.successRate || "0%",
      icon: CheckCircle,
      trend: "+2% this week",
      trendIcon: TrendingUp,
      trendPositive: true,
    },
    {
      title: "Avg Time",
      value: metrics?.avgTime || "0.0m",
      icon: Clock,
      trend: "-0.5m improvement",
      trendIcon: TrendingDown,
      trendPositive: true,
    },
    {
      title: "Webhooks",
      value: metrics?.webhooks?.toString() || "0",
      icon: Webhook,
      trend: "Today",
      trendIcon: Activity,
      trendPositive: true,
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
          Statistics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track performance metrics and automation analytics
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricsData.map((metric) => (
          <MetricsCard key={metric.title} {...metric} />
        ))}
      </div>

      {/* Event Log */}
      <div>
        <h2 className="text-lg font-medium mb-3">Recent Events</h2>
        <EventLogTable 
          events={events.map((e) => ({
            ...e,
            timestamp: formatTimestamp(e.timestamp),
          }))} 
        />
      </div>
    </div>
  );
}
