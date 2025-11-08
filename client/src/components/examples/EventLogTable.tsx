import { EventLogTable } from '../event-log-table';

const mockEvents = [
  {
    id: "evt-1",
    timestamp: "2m ago",
    type: "pull_request" as const,
    repository: "acme/web-app",
    action: "opened #234",
    status: "success" as const,
  },
  {
    id: "evt-2",
    timestamp: "5m ago",
    type: "push" as const,
    repository: "acme/api-server",
    action: "feature/auth-v2",
    status: "pending" as const,
  },
  {
    id: "evt-3",
    timestamp: "8m ago",
    type: "issue" as const,
    repository: "acme/web-app",
    action: "created #89",
    status: "failed" as const,
  },
];

export default function EventLogTableExample() {
  return <EventLogTable events={mockEvents} />;
}
