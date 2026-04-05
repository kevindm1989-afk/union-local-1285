import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useGetTask, useUpdateTask, useDeleteTask, getGetTaskQueryKey, getListTasksQueryKey, getGetTasksSummaryQueryKey, getGetRecentTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TaskStatus, TaskPriority } from "@/types/task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Trash2, Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const taskId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: task, isLoading } = useGetTask(taskId, {
    query: {
      enabled: !!taskId,
      queryKey: getGetTaskQueryKey(taskId)
    }
  });

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.pending);
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.medium);
  const [dueDate, setDueDate] = useState("");

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (task && initializedForId.current !== taskId) {
      initializedForId.current = taskId;
      setTitle(task.title);
      setDescription(task.description || "");
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.dueDate || "");
    }
  }, [task, taskId]);

  const handleUpdate = useCallback((field: string, value: string) => {
    updateTask.mutate({
      id: taskId,
      data: { [field]: value }
    }, {
      onSuccess: (updatedTask) => {
        queryClient.setQueryData(getGetTaskQueryKey(taskId), updatedTask);
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentTasksQueryKey() });
      }
    });
  }, [taskId, updateTask, queryClient]);

  const handleDelete = () => {
    deleteTask.mutate({ id: taskId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentTasksQueryKey() });
        setLocation("/tasks");
      }
    });
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </MobileLayout>
    );
  }

  if (!task) return null;

  return (
    <MobileLayout>
      <div className="min-h-full bg-background flex flex-col">
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/tasks" className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-semibold tracking-tight text-sm">Task Details</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[320px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the task.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="sm:flex-col gap-2">
                <AlertDialogCancel className="w-full sm:w-full mt-0">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-full">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        <div className="p-6 flex-1 space-y-6 animate-in fade-in duration-300">
          
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Title</label>
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title !== task.title && title.trim() !== "") {
                  handleUpdate("title", title);
                } else if (title.trim() === "") {
                  setTitle(task.title); // Revert if empty
                }
              }}
              placeholder="Task title"
              className="h-14 text-lg font-semibold rounded-xl bg-card border-transparent hover:border-border focus:border-primary focus-visible:ring-0 px-3 shadow-none transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Notes</label>
            <Textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== (task.description || "")) {
                  handleUpdate("description", description);
                }
              }}
              placeholder="Add details about this task..."
              className="min-h-[120px] rounded-xl bg-card border-transparent hover:border-border focus:border-primary focus-visible:ring-0 px-3 shadow-none transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Status</label>
              <Select 
                value={status} 
                onValueChange={(value: TaskStatus) => {
                  setStatus(value);
                  handleUpdate("status", value);
                }}
              >
                <SelectTrigger className="h-12 rounded-xl bg-card border-border shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value={TaskStatus.pending}>To Do</SelectItem>
                  <SelectItem value={TaskStatus.in_progress}>In Progress</SelectItem>
                  <SelectItem value={TaskStatus.completed}>Done</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Priority</label>
              <Select 
                value={priority} 
                onValueChange={(value: TaskPriority) => {
                  setPriority(value);
                  handleUpdate("priority", value);
                }}
              >
                <SelectTrigger className="h-12 rounded-xl bg-card border-border shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value={TaskPriority.low}>Low</SelectItem>
                  <SelectItem value={TaskPriority.medium}>Medium</SelectItem>
                  <SelectItem value={TaskPriority.high}>High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Due Date</label>
            <div className="relative">
              <Input 
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  handleUpdate("dueDate", e.target.value || "");
                }}
                className="h-12 rounded-xl bg-card border-border shadow-sm pl-10"
              />
              <Calendar className="w-4 h-4 absolute left-3 top-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div className="pt-4 text-xs text-center text-muted-foreground">
            Created on {format(new Date(task.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </div>

        </div>
      </div>
    </MobileLayout>
  );
}