import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useCreateAnnouncement,
  getListAnnouncementsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Loader2, AlertTriangle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "urgent", label: "Urgent" },
  { value: "contract", label: "Contract" },
  { value: "meeting", label: "Meeting" },
  { value: "action", label: "Action" },
  { value: "safety_alert", label: "Safety Alert" },
  { value: "strike_action", label: "Strike Action" },
] as const;

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  category: z.enum(["general", "urgent", "contract", "meeting", "action", "safety_alert", "strike_action"]).default("general"),
  isUrgent: z.boolean().default(false),
  urgencyLevel: z.enum(["normal", "high", "critical"]).default("normal"),
});

export default function BulletinCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createAnnouncement = useCreateAnnouncement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        setLocation("/bulletins");
      },
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", content: "", category: "general", isUrgent: false, urgencyLevel: "normal" },
  });

  const category = form.watch("category");
  const urgencyLevel = form.watch("urgencyLevel");

  useEffect(() => {
    if (category === "safety_alert" || category === "strike_action") {
      form.setValue("urgencyLevel", "critical");
      form.setValue("isUrgent", true);
    } else if (category === "urgent") {
      form.setValue("urgencyLevel", "high");
      form.setValue("isUrgent", true);
    }
  }, [category]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createAnnouncement.mutate({ data: values as Parameters<typeof createAnnouncement.mutate>[0]["data"] });
  };

  const isCritical = urgencyLevel === "critical";
  const isHighOnly = urgencyLevel === "high";

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/bulletins" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold tracking-tight text-sm uppercase">Post Bulletin</span>
          <div className="w-10" />
        </header>

        {isCritical && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center gap-2 text-xs font-bold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Emergency — this will trigger a full-screen alert for all members
          </div>
        )}
        {isHighOnly && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-xs font-bold">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            High priority — push notification will be sent to all members
          </div>
        )}

        <div className="p-5 flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Bulletin headline" className="h-12 rounded-xl bg-card font-semibold" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Content</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Write the full announcement here..." className="min-h-[160px] rounded-xl bg-card resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="urgencyLevel" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={cn("h-12 rounded-xl bg-card", field.value === "critical" && "border-red-500 text-red-600", field.value === "high" && "border-amber-500 text-amber-600")}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High — push notification</SelectItem>
                        <SelectItem value="critical">Critical — emergency alert</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="isUrgent" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 h-14">
                    <div>
                      <FormLabel className="text-sm font-semibold text-foreground cursor-pointer">Pin as Urgent</FormLabel>
                      <p className="text-xs text-muted-foreground">Pins to top and highlights in red</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </div>
                </FormItem>
              )} />

              <div className="pt-2">
                <Button
                  type="submit"
                  className={cn("w-full h-14 rounded-xl text-base font-bold", isCritical && "bg-red-600 hover:bg-red-700")}
                  disabled={createAnnouncement.isPending}
                >
                  {createAnnouncement.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Post Bulletin"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </MobileLayout>
  );
}
