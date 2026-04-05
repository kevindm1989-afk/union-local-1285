import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useListTasks } from "@workspace/api-client-react";
import { TaskCard } from "@/components/TaskCard";
import { TaskStatus, TaskPriority } from "@workspace/api-client-react/src/generated/api.schemas";
import { Skeleton } from "@/components/ui/skeleton";
import { ListTodo, Filter } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function Tasks() {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  
  const { data: tasks, isLoading } = useListTasks(
    filterStatus !== "all" ? { status: filterStatus } : undefined
  );

  const pendingCount = tasks?.filter(t => t.status === "pending").length || 0;
  const inProgressCount = tasks?.filter(t => t.status === "in_progress").length || 0;
  const doneCount = tasks?.filter(t => t.status === "completed").length || 0;

  return (
    <MobileLayout>
      <div className="p-6 space-y-6">
        
        <header className="flex items-center justify-between mt-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            All Tasks
          </h1>
          <div className="p-2 bg-secondary text-secondary-foreground rounded-full">
            <Filter className="w-5 h-5" />
          </div>
        </header>

        <Tabs defaultValue="all" onValueChange={(v) => setFilterStatus(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-muted h-12 rounded-xl p-1">
            <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs font-semibold">
              All
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs font-semibold">
              To Do
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs font-semibold">
              Doing
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs font-semibold">
              Done
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3 animate-in fade-in duration-300">
          {isLoading ? (
            <>
              <Skeleton className="h-[120px] rounded-2xl" />
              <Skeleton className="h-[120px] rounded-2xl" />
              <Skeleton className="h-[120px] rounded-2xl" />
              <Skeleton className="h-[120px] rounded-2xl" />
            </>
          ) : tasks?.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border mt-8">
              <ListTodo className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-20" />
              <h3 className="text-lg font-bold mb-1">No tasks found</h3>
              <p className="text-sm text-muted-foreground">Try changing your filters or add a new task.</p>
            </div>
          ) : (
            tasks?.map(task => (
              <TaskCard key={task.id} task={task} />
            ))
          )}
        </div>

      </div>
    </MobileLayout>
  );
}