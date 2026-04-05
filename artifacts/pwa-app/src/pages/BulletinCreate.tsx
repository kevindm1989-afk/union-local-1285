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
import { ChevronLeft, Loader2 } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  category: z.enum(["general", "urgent", "contract", "meeting", "action"]).default("general"),
  isUrgent: z.boolean().default(false),
});

export default function BulletinCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createAnnouncement = useCreateAnnouncement();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", content: "", category: "general", isUrgent: false },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createAnnouncement.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        setLocation("/bulletins");
      },
    });
  };

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
                    <Textarea placeholder="Write the full announcement here..." className="min-h-[180px] rounded-xl bg-card resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="action">Action</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="isUrgent" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 h-14">
                    <div>
                      <FormLabel className="text-sm font-semibold text-foreground cursor-pointer">Mark as Urgent</FormLabel>
                      <p className="text-xs text-muted-foreground">Pins to top and highlights in red</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </div>
                </FormItem>
              )} />

              <div className="pt-4">
                <Button type="submit" className="w-full h-14 rounded-xl text-base font-bold" disabled={createAnnouncement.isPending}>
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
