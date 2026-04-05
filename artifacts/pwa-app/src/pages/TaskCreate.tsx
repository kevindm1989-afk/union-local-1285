import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useCreateTask, getListTasksQueryKey, getGetTasksSummaryQueryKey, getGetRecentTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TaskStatus, TaskPriority } from "@/types/task";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum([TaskStatus.pending, TaskStatus.in_progress, TaskStatus.completed]),
  priority: z.enum([TaskPriority.low, TaskPriority.medium, TaskPriority.high]),
  dueDate: z.string().optional()
});

export default function TaskCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createTask = useCreateTask();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      status: TaskStatus.pending,
      priority: TaskPriority.medium,
      dueDate: ""
    }
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createTask.mutate({
      data: {
        ...values,
        dueDate: values.dueDate || null,
        description: values.description || null,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTasksSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentTasksQueryKey() });
        setLocation("/tasks");
      }
    });
  };

  return (
    <MobileLayout>
      <div className="min-h-full bg-background flex flex-col">
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/tasks" className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-semibold tracking-tight">New Task</span>
          <div className="w-10"></div> {/* Spacer for centering */}
        </header>

        <div className="p-6 flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Title</FormLabel>
                    <FormControl>
                      <Input placeholder="What needs to be done?" className="h-14 text-lg font-medium rounded-xl bg-card border-border shadow-sm focus-visible:ring-primary/20" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Add some details..." 
                        className="min-h-[120px] rounded-xl bg-card border-border shadow-sm resize-none focus-visible:ring-primary/20" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl bg-card">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          <SelectItem value={TaskStatus.pending}>To Do</SelectItem>
                          <SelectItem value={TaskStatus.in_progress}>In Progress</SelectItem>
                          <SelectItem value={TaskStatus.completed}>Done</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl bg-card">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          <SelectItem value={TaskPriority.low}>Low</SelectItem>
                          <SelectItem value={TaskPriority.medium}>Medium</SelectItem>
                          <SelectItem value={TaskPriority.high}>High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-12 rounded-xl bg-card border-border shadow-sm block w-full text-foreground" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="pt-6">
                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-base font-semibold shadow-primary/20 shadow-lg active:scale-[0.98] transition-all"
                  disabled={createTask.isPending}
                >
                  {createTask.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Task"}
                </Button>
              </div>

            </form>
          </Form>
        </div>
      </div>
    </MobileLayout>
  );
}