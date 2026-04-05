import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useGetGrievance,
  useUpdateGrievance,
  useDeleteGrievance,
  getGetGrievanceQueryKey,
  getListGrievancesQueryKey,
  getGetGrievancesSummaryQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  pending_response: "bg-amber-100 text-amber-800 border-amber-200",
  pending_hearing: "bg-orange-100 text-orange-800 border-orange-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  withdrawn: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function GrievanceDetail() {
  const { id } = useParams<{ id: string }>();
  const grievanceId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: grievance, isLoading } = useGetGrievance(grievanceId, {
    query: { enabled: !!grievanceId, queryKey: getGetGrievanceQueryKey(grievanceId) },
  });

  const updateGrievance = useUpdateGrievance();
  const deleteGrievance = useDeleteGrievance();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contractArticle, setContractArticle] = useState("");
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState("open");
  const [step, setStep] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (grievance && !initialized.current) {
      initialized.current = true;
      setTitle(grievance.title);
      setDescription(grievance.description || "");
      setContractArticle(grievance.contractArticle || "");
      setNotes(grievance.notes || "");
      setResolution(grievance.resolution || "");
      setStatus(grievance.status);
      setStep(String(grievance.step));
      setDueDate(grievance.dueDate || "");
    }
  }, [grievance]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetGrievanceQueryKey(grievanceId) });
    queryClient.invalidateQueries({ queryKey: getListGrievancesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGrievancesSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  };

  const handleUpdate = (field: string, value: unknown) => {
    updateGrievance.mutate({ id: grievanceId, data: { [field]: value } }, { onSuccess: invalidateAll });
  };

  const handleDelete = () => {
    deleteGrievance.mutate({ id: grievanceId }, {
      onSuccess: () => {
        invalidateAll();
        setLocation("/grievances");
      },
    });
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-5 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </MobileLayout>
    );
  }

  if (!grievance) return null;

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/grievances" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div className="text-center">
            <span className="font-bold text-xs tracking-wider uppercase block">{grievance.grievanceNumber}</span>
            <span className={cn("text-[9px] uppercase font-bold px-2 py-0.5 rounded border", statusColors[grievance.status])}>
              {grievance.status.replace(/_/g, " ")}
            </span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[320px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this grievance?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2">
                <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive w-full">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        <div className="p-5 space-y-5 flex-1">
          {grievance.memberName && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Member</p>
              <p className="text-sm font-semibold text-foreground">{grievance.memberName}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title !== grievance.title && title.trim()) handleUpdate("title", title); else if (!title.trim()) setTitle(grievance.title); }}
              className="h-12 rounded-xl bg-card font-semibold" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contract Article</label>
            <Input value={contractArticle} onChange={(e) => setContractArticle(e.target.value)}
              onBlur={() => { if (contractArticle !== (grievance.contractArticle || "")) handleUpdate("contractArticle", contractArticle || null); }}
              placeholder="e.g. Article 12, Section 4" className="h-12 rounded-xl bg-card" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step</label>
              <Select value={step} onValueChange={(v) => { setStep(v); handleUpdate("step", parseInt(v)); }}>
                <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="1">Step 1</SelectItem>
                  <SelectItem value="2">Step 2</SelectItem>
                  <SelectItem value="3">Step 3</SelectItem>
                  <SelectItem value="4">Step 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</label>
              <Select value={status} onValueChange={(v) => { setStatus(v); handleUpdate("status", v); }}>
                <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending_response">Pending Response</SelectItem>
                  <SelectItem value="pending_hearing">Pending Hearing</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Response Due Date</label>
            <Input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); handleUpdate("dueDate", e.target.value || null); }}
              className="h-12 rounded-xl bg-card" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (grievance.description || "")) handleUpdate("description", description || null); }}
              placeholder="Describe the violation..." className="min-h-[100px] rounded-xl bg-card resize-none" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Steward Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (grievance.notes || "")) handleUpdate("notes", notes || null); }}
              placeholder="Witnesses, evidence, next steps..." className="min-h-[80px] rounded-xl bg-card resize-none" />
          </div>

          {(status === "resolved" || status === "withdrawn") && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resolution</label>
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)}
                onBlur={() => { if (resolution !== (grievance.resolution || "")) handleUpdate("resolution", resolution || null); }}
                placeholder="How was this resolved?" className="min-h-[80px] rounded-xl bg-card resize-none" />
            </div>
          )}

          <div className="pt-2 text-center text-xs text-muted-foreground space-y-0.5">
            <p>Filed {format(new Date(grievance.filedDate), "MMMM d, yyyy")}</p>
            <p>Last updated {format(new Date(grievance.updatedAt), "MMM d 'at' h:mm a")}</p>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
