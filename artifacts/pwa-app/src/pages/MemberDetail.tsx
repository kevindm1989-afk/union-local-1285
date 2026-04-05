import { useState, useEffect } from "react";
import {
  useGetMember,
  useGetMemberGrievances,
  useUpdateMember,
  useDeleteMember,
  getGetMemberQueryKey,
  getGetMemberGrievancesQueryKey,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useParams, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone, Mail, Building, Briefcase, Calendar,
  FileText, ChevronLeft, ArrowRight, Pencil, Trash2, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function field(label: string, children: React.ReactNode) {
  return (
    <div className="px-4 py-3.5 flex items-center justify-between border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
      <span className="font-semibold text-foreground text-right ml-4">{children}</span>
    </div>
  );
}

export default function MemberDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [classification, setClassification] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: member, isLoading } = useGetMember(id, {
    query: { enabled: !!id, queryKey: getGetMemberQueryKey(id) },
  });

  const { data: grievances, isLoading: isLoadingGrievances } = useGetMemberGrievances(id, {
    query: { enabled: !!id, queryKey: getGetMemberGrievancesQueryKey(id) },
  });

  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();

  // Populate form fields whenever member loads or edit sheet opens
  useEffect(() => {
    if (member && editOpen) {
      setName(member.name ?? "");
      setEmployeeId(member.employeeId ?? "");
      setDepartment(member.department ?? "");
      setClassification(member.classification ?? "");
      setPhone(member.phone ?? "");
      setEmail(member.email ?? "");
      setJoinDate(member.joinDate ?? "");
      setNotes(member.notes ?? "");
    }
  }, [member, editOpen]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    setSaving(true);
    updateMember.mutate(
      {
        id,
        data: {
          name: name.trim(),
          employeeId: employeeId || null,
          department: department || null,
          classification: classification || null,
          phone: phone || null,
          email: email || null,
          joinDate: joinDate || null,
          notes: notes || null,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setEditOpen(false);
          setSaving(false);
        },
        onError: () => setSaving(false),
      }
    );
  };

  const handleDelete = () => {
    deleteMember.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
          setLocation("/members");
        },
      }
    );
  };

  const statusBadge = (isActive: boolean) => (
    <span
      className={cn(
        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
        isActive
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );

  return (
    <MobileLayout>
      <div className="p-4 space-y-5 pb-10">
        {/* Header */}
        <header className="flex items-center gap-3 mt-1">
          <Link
            href="/members"
            className="w-10 h-10 flex items-center justify-center bg-card rounded-full shadow-sm border border-border shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold tracking-tight text-foreground leading-tight">
                  {member?.name}
                </h1>
                {member && statusBadge(member.isActive)}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 rounded-xl shrink-0"
            onClick={() => setEditOpen(true)}
            disabled={isLoading || !member}
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Button>
        </header>

        {/* Info card */}
        {isLoading ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : member ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {member.employeeId && field("Employee ID", member.employeeId)}
            {field("Department", member.department || <span className="text-muted-foreground">—</span>)}
            {field("Classification", member.classification || <span className="text-muted-foreground">—</span>)}
            {field(
              "Phone",
              member.phone ? (
                <a href={`tel:${member.phone}`} className="text-primary">
                  {member.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            )}
            {field(
              "Email",
              member.email ? (
                <a href={`mailto:${member.email}`} className="text-primary">
                  {member.email}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            )}
            {member.joinDate &&
              field(
                "Seniority Date",
                format(new Date(member.joinDate), "MMM d, yyyy")
              )}
          </div>
        ) : null}

        {/* Notes */}
        {member?.notes && (
          <div className="bg-muted/40 border border-border rounded-xl px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Steward Notes
            </p>
            <p className="text-sm whitespace-pre-wrap text-foreground">{member.notes}</p>
          </div>
        )}

        {/* Grievances */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Grievance History
            </p>
            <Link
              href={`/grievances/new`}
              className="text-xs font-bold text-primary uppercase tracking-wider"
            >
              + File New
            </Link>
          </div>

          {isLoadingGrievances ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : !grievances?.length ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">No grievances filed</p>
            </div>
          ) : (
            <div className="space-y-2">
              {grievances.map((g) => (
                <Link key={g.id} href={`/grievances/${g.id}`} className="block">
                  <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.98] transition-transform">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{g.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {g.grievanceNumber} · Step {g.step}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] uppercase font-bold bg-muted px-2 py-0.5 rounded-full">
                        {g.status.replace(/_/g, " ")}
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Danger zone — remove member */}
        {member && (
          <div className="pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full h-11 rounded-xl text-destructive hover:bg-destructive/10 gap-2 border border-dashed border-destructive/30"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove Member
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[320px] rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the member record and all associated data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2">
                  <AlertDialogCancel className="w-full rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive hover:bg-destructive/90 w-full rounded-xl"
                    disabled={deleteMember.isPending}
                  >
                    {deleteMember.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Remove Member"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Edit sheet */}
      <Sheet open={editOpen} onOpenChange={(o) => { if (!saving) setEditOpen(o); }}>
        <SheetContent side="bottom" className="h-auto max-h-[92dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">Edit Member</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 pb-8">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Full Name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="h-12 rounded-xl bg-card"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Employee ID
                </label>
                <Input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="E12345"
                  className="h-12 rounded-xl bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Seniority Date
                </label>
                <Input
                  type="date"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
                  className="h-12 rounded-xl bg-card"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Department
                </label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Assembly"
                  className="h-12 rounded-xl bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Classification
                </label>
                <Input
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                  placeholder="Welder I"
                  className="h-12 rounded-xl bg-card"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Phone
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="h-12 rounded-xl bg-card"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="h-12 rounded-xl bg-card"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Steward Notes
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any relevant notes..."
                className="min-h-[80px] rounded-xl bg-card resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={() => setEditOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={handleSave}
                disabled={saving || !name.trim()}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
