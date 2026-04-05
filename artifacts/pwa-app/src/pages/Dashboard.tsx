import { MobileLayout } from "@/components/layout/MobileLayout";
import { useGetTasksSummary, useGetRecentTasks } from "@workspace/api-client-react";
import { TaskCard } from "@/components/TaskCard";
import { Link } from "wouter";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ListTodo, AlertCircle, Clock, ChevronRight } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetTasksSummary();
  const { data: recentTasks, isLoading: isLoadingRecent } = useGetRecentTasks({ limit: 5 });

  const today = new Date();

  return (
    <MobileLayout>
      <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <header className="space-y-1 mt-4">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {format(today, "EEEE, MMMM do")}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Good morning.
          </h1>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 gap-3">
          {isLoadingSummary ? (
            <>
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </>
          ) : (
            <>
              <div className="bg-primary text-primary-foreground rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 opacity-10">
                  <ListTodo className="w-24 h-24" />
                </div>
                <div className="flex flex-col h-full justify-between relative z-10">
                  <span className="text-sm font-medium opacity-90">Pending</span>
                  <span className="text-4xl font-bold tracking-tighter mt-2">{summary?.pending || 0}</span>
                </div>
              </div>
              
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col h-full justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Done</span>
                  </div>
                  <span className="text-3xl font-bold tracking-tighter mt-2 text-foreground">{summary?.completed || 0}</span>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col h-full justify-between">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">Due Today</span>
                  </div>
                  <span className="text-3xl font-bold tracking-tighter mt-2 text-amber-800 dark:text-amber-400">{summary?.due_today || 0}</span>
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col h-full justify-between">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">High Prio</span>
                  </div>
                  <span className="text-3xl font-bold tracking-tighter mt-2 text-red-800 dark:text-red-400">{summary?.high_priority || 0}</span>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Recent Tasks */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Recent Tasks</h2>
            <Link href="/tasks" className="text-sm font-medium text-primary flex items-center">
              View all <ChevronRight className="w-4 h-4 ml-0.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {isLoadingRecent ? (
              <>
                <Skeleton className="h-[120px] rounded-2xl" />
                <Skeleton className="h-[120px] rounded-2xl" />
                <Skeleton className="h-[120px] rounded-2xl" />
              </>
            ) : recentTasks?.length === 0 ? (
              <div className="text-center py-10 bg-card rounded-2xl border border-dashed border-border">
                <ListTodo className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-20" />
                <p className="text-muted-foreground font-medium">No recent tasks</p>
                <p className="text-sm text-muted-foreground mt-1">Time to add something new.</p>
              </div>
            ) : (
              recentTasks?.map(task => (
                <TaskCard key={task.id} task={task} />
              ))
            )}
          </div>
        </section>

      </div>
    </MobileLayout>
  );
}