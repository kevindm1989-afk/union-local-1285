export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export const TaskStatus = {
  pending: "pending" as const,
  in_progress: "in_progress" as const,
  completed: "completed" as const,
};

export const TaskPriority = {
  low: "low" as const,
  medium: "medium" as const,
  high: "high" as const,
};
