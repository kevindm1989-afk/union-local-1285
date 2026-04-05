import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useCreateGrievance,
  useListMembers,
  getListGrievancesQueryKey,
  getGetGrievancesSummaryQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2 } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  memberId: z.string().optional(),
  description: z.string().optional(),
  contractArticle: z.string().optional(),
  step: z.string().default("1"),
  status: z.enum(["open", "pending_response", "pending_hearing", "resolved", "withdrawn"]).default("open"),
  filedDate: z.string().min(1, "Filed date is required"),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export default function GrievanceCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createGrievance = useCreateGrievance();
  const { data: members } = useListMembers();

  const todayStr = new Date().toISOString().split("T")[0];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      memberId: "",
      description: "",
      contractArticle: "",
      step: "1",
      status: "open",
      filedDate: todayStr,
      dueDate: "",
      notes: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createGrievance.mutate(
      {
        data: {
          title: values.title,
          memberId: values.memberId ? parseInt(values.memberId) : null,
          description: values.description || null,
          contractArticle: values.contractArticle || null,
          step: parseInt(values.step),
          status: values.status,
          filedDate: values.filedDate,
          dueDate: values.dueDate || null,
          notes: values.notes || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGrievancesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetGrievancesSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
          setLocation("/grievances");
        },
      }
    );
  };

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/grievances" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold tracking-tight text-sm uppercase">File Grievance</span>
          <div className="w-10" />
        </header>

        <div className="p-5 flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grievance Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief description of the violation" className="h-12 rounded-xl bg-card" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="memberId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Member (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl bg-card">
                        <SelectValue placeholder="General / Class grievance" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="">General / Class Grievance</SelectItem>
                      {members?.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="contractArticle" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contract Article Violated</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Article 12, Section 4" className="h-12 rounded-xl bg-card" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the violation in detail..." className="min-h-[100px] rounded-xl bg-card resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="step" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl bg-card">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="1">Step 1</SelectItem>
                        <SelectItem value="2">Step 2</SelectItem>
                        <SelectItem value="3">Step 3</SelectItem>
                        <SelectItem value="4">Step 4</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl bg-card">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="pending_response">Pending Response</SelectItem>
                        <SelectItem value="pending_hearing">Pending Hearing</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="withdrawn">Withdrawn</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="filedDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filed Date</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-12 rounded-xl bg-card" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="dueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Response Due</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-12 rounded-xl bg-card" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Steward Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes, witnesses, evidence..." className="min-h-[80px] rounded-xl bg-card resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="pt-4">
                <Button type="submit" className="w-full h-14 rounded-xl text-base font-bold" disabled={createGrievance.isPending}>
                  {createGrievance.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "File Grievance"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </MobileLayout>
  );
}
