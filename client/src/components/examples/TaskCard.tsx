import { TaskCard } from '../task-card';

export default function TaskCardExample() {
  return (
    <TaskCard
      id="task-1"
      title="Refactor authentication middleware"
      status="executing"
      timestamp="2m ago"
      summary="Analyzing current auth flow, identifying security improvements, and planning modular refactoring approach"
      progress={65}
      repository="acme/web-app"
    />
  );
}
