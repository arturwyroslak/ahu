import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface MetricsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendIcon?: LucideIcon;
  trendPositive?: boolean;
}

export function MetricsCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendIcon: TrendIcon,
  trendPositive = true 
}: MetricsCardProps) {
  return (
    <Card 
      data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className="hover-elevate transition-all duration-200"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div 
          className="text-3xl font-bold tabular-nums" 
          data-testid={`text-metric-value-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {value}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${
            trendPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {TrendIcon && <TrendIcon className="h-3 w-3" />}
            <span>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
