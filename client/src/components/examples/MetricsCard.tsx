import { MetricsCard } from '../metrics-card';
import { Activity } from 'lucide-react';

export default function MetricsCardExample() {
  return <MetricsCard title="Active Tasks" value="3" icon={Activity} trend="+2 from last hour" />;
}
