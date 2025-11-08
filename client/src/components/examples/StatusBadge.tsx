import { StatusBadge } from '../status-badge';

export default function StatusBadgeExample() {
  return (
    <div className="flex gap-2 p-4">
      <StatusBadge status="planning" />
      <StatusBadge status="executing" />
      <StatusBadge status="completed" />
      <StatusBadge status="failed" />
      <StatusBadge status="queued" />
    </div>
  );
}
