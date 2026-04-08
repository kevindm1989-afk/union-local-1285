import { useState } from "react";
import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type PortalGrievance = {
  id: number;
  grievanceNumber: string;
  title: string;
  description: string | null;
  step: number;
  status: string;
  filedDate: string;
  dueDate: string | null;
  resolvedDate: string | null;
  accommodationRequest: boolean;
};

const statusColors: Record<string, string> = {
  member_requested: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  pending_response: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  pending_hearing: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  resolved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  withdrawn: "bg-muted text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  member_requested: "Requested — Under Review",
  open: "Filed",
  pending_response: "Pending Response",
  pending_hearing: "Pending Hearing",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
};

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function MemberPortalGrievances() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [accommodationRequest, setAccommodationRequest] = useState(false);

  const { data: grievances = [], isLoading } = useQuery<PortalGrievance[]>({
    queryKey: ["/member-portal/grievances"],
    queryFn: () => fetchJson("/api/member-portal/grievances"),
  });

  const submitMutation = useMutation({
    mutationFn: (body: { description: string; dateOfIncident: string; accommodationRequest: boolean }) =>
      fetchJson("/api/member-portal/grievances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/member-portal/grievances"] });
      setSheetOpen(false);
      setDescription("");
      setDateOfIncident("");
      setAccommodationRequest(false);
      toast({ title: "Request submitted", description: "Your steward or chair has been notified and will review your request." });
    },
    onError: () => toast({ title: "Failed to submit request", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!description.trim() || !dateOfIncident) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    submitMutation.mutate({ description: description.trim(), dateOfIncident, accommodationRequest });
  };

  return (
    <MemberPortalLayout>
      <div className="p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Grievances</h1>
            <p className="text-xs text-muted-foreground">{grievances.length} total</p>
          </div>
          <Button size="sm" onClick={() => setSheetOpen(true)} className="gap-1.5 text-xs h-8">
            <Plus className="w-3.5 h-3.5" /> Request Filing
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : grievances.length === 0 ? (
          <Card className="border-dashed border-border/60">
            <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">No grievances yet</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Tap "Request Filing" to ask your steward or chair to file a grievance</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {grievances.map((g) => (
              <Card key={g.id} className="border-border/50">
                <CardContent className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground">{g.grievanceNumber}</span>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", statusColors[g.status] ?? statusColors.open)}>
                          {statusLabel[g.status] ?? g.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Step {g.step}</span>
                        {g.accommodationRequest && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">ADA</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground mt-1 line-clamp-2">{g.description ?? g.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Filed {format(new Date(g.filedDate), "MMM d, yyyy")}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Request Grievance Filing</SheetTitle>
            <p className="text-xs text-muted-foreground">Your steward or chair will review your request and file the grievance on your behalf.</p>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date of Incident <span className="text-destructive">*</span></Label>
              <Input type="date" value={dateOfIncident} onChange={(e) => setDateOfIncident(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Describe the Issue <span className="text-destructive">*</span></Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened, when, where, and who was involved..."
                rows={5}
                className="text-sm resize-none"
              />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <input
                type="checkbox"
                id="accommodation"
                checked={accommodationRequest}
                onChange={(e) => setAccommodationRequest(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <Label htmlFor="accommodation" className="text-xs cursor-pointer">
                This may involve a duty to accommodate (disability, medical)
              </Label>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Grievances must typically be filed within the timelines set by your collective agreement. Contact your steward if you're unsure.
              </p>
            </div>
            <Button onClick={handleSubmit} disabled={submitMutation.isPending} className="w-full gap-2">
              {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Send Request to Steward
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </MemberPortalLayout>
  );
}
