import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TaskStatus, TaskPriority } from "@/types/task";

export function StatusBadge({ status, className }: { status: TaskStatus, className?: string }) {
  const styles = {
    [TaskStatus.pending]: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 border-transparent",
    [TaskStatus.in_progress]: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 border-transparent",
    [TaskStatus.completed]: "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 border-transparent"
  };
  
  const labels = {
    [TaskStatus.pending]: "To Do",
    [TaskStatus.in_progress]: "In Progress",
    [TaskStatus.completed]: "Done"
  };

  return (
    <Badge variant="outline" className={cn("font-medium rounded-md px-2 py-0.5", styles[status], className)}>
      {labels[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: TaskPriority, className?: string }) {
  const styles = {
    [TaskPriority.low]: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 border-transparent",
    [TaskPriority.medium]: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 border-transparent",
    [TaskPriority.high]: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 border-transparent"
  };
  
  const labels = {
    [TaskPriority.low]: "Low",
    [TaskPriority.medium]: "Medium",
    [TaskPriority.high]: "High"
  };

  return (
    <Badge variant="outline" className={cn("font-medium rounded-md px-2 py-0.5", styles[priority], className)}>
      {labels[priority]}
    </Badge>
  );
}