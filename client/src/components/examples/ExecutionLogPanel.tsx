import { ExecutionLogPanel } from '../execution-log-panel';

const mockLogs = [
  { id: "1", timestamp: "14:23:01", level: "info" as const, message: "Task initiated: Refactor authentication middleware" },
  { id: "2", timestamp: "14:23:02", level: "info" as const, message: "Analyzing repository structure..." },
  { id: "3", timestamp: "14:23:05", level: "success" as const, message: "Repository cloned successfully" },
  { id: "4", timestamp: "14:23:07", level: "info" as const, message: "Reading authentication middleware files" },
  { id: "5", timestamp: "14:23:12", level: "warn" as const, message: "Detected potential security vulnerability" },
  { id: "6", timestamp: "14:23:15", level: "error" as const, message: "Critical: Hardcoded secrets found in codebase" },
];

export default function ExecutionLogPanelExample() {
  return (
    <div className="h-[400px]">
      <ExecutionLogPanel logs={mockLogs} />
    </div>
  );
}
