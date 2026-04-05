import { Link } from "wouter";
import { format } from "date-fns";
import { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { StatusBadge, PriorityBadge } from "./TaskBadges";
import { Calendar, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function TaskCard({ task }: { task: Task }) {
  const isCompleted = task.status === "completed";
  
  return (
    <Link href={`/tasks/${task.id}`} className="block outline-none group active-elevate">
      <div className={cn(
        "p-4 bg-card rounded-2xl border transition-all duration-200 group-active:scale-[0.98]",
        isCompleted ? "opacity-60 bg-muted/30" : "shadow-sm"
      )}>
        <div className="flex justify-between items-start mb-3 gap-3">
          <h3 className={cn(
            "font-semibold text-base leading-tight tracking-tight text-foreground line-clamp-2",
            isCompleted && "line-through text-muted-foreground"
          )}>
            {task.title}
          </h3>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
        
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {task.description}
          </p>
        )}
        
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          
          {task.dueDate && (
            <div className={cn(
              "flex items-center text-xs font-medium gap-1",
              new Date(task.dueDate) < new Date() && !isCompleted ? "text-destructive" : "text-muted-foreground"
            )}>
              <Calendar className="w-3 h-3" />
              {format(new Date(task.dueDate), "MMM d")}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}