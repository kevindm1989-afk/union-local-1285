import { useState, useEffect, useRef } from "react";
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
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { usePermissions } from "@/App";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone, Mail, Building, Briefcase, Calendar,
  FileText, ChevronLeft, ArrowRight, Pencil, Trash2, Loader2,
  Paperclip, Download, Upload, X,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

type MemberFileCategory = "general" | "discipline" | "grievance";

interface MemberFile {
  id: number;
  memberId: number;
  category: MemberFileCategory;
  filename: string;
  objectPath: string;
  contentType: string;
  fileSize: number | null;
  description: string | null;
  uploadedAt: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function field(label: string, children: React.ReactNode) {
  return (
    <div className="px-4 py-3.5 flex items-center justify-between border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
      <span className="font-semibold text-foreground text-right ml-4">{children}</span>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadUrl(objectPath: string): string {
  return `/api/storage/objects/${objectPath.replace(/^\/objects\//, "")}`;
}

const CATEGORY_LABELS: Record<MemberFileCategory, string> = {
  general: "General",
  discipline: "Discipline",
  grievance: "Grievance",
};

const CATEGORY_COLORS: Record<MemberFileCategory, string> = {
  general: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  discipline: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  grievance: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

// ─── component ────────────────────────────────────────────────────────────────

export default function MemberDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { can } = usePermissions();
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
  const [seniorityDate, setSeniorityDate] = useState("");
  const [duesStatus, setDuesStatus] = useState("current");
  const [duesLastPaid, setDuesLastPaid] = useState("");
  const [shift, setShift] = useState("");
  const [classificationDate, setClassificationDate] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  // Files state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<MemberFileCategory>("general");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MemberFileCategory | "all">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: member, isLoading } = useGetMember(id, {
    query: { enabled: !!id, queryKey: getGetMemberQueryKey(id) },
  });

  const { data: grievances, isLoading: isLoadingGrievances } = useGetMemberGrievances(id, {
    query: { enabled: !!id, queryKey: getGetMemberGrievancesQueryKey(id) },
  });

  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();

  // ── Files query ──
  const filesQueryKey = ["member-files", id];
  const { data: allFiles = [], isLoading: isLoadingFiles } = useQuery<MemberFile[]>({
    queryKey: filesQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/members/${id}/files`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load files");
      return res.json();
    },
    enabled: !!id,
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const res = await fetch(`/api/members/${id}/files/${fileId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete file");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: filesQueryKey }),
  });

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
      setSeniorityDate(member.seniorityDate ? new Date(member.seniorityDate).toISOString().split("T")[0] : "");
      setDuesStatus(member.duesStatus ?? "current");
      setDuesLastPaid(member.duesLastPaid ? new Date(member.duesLastPaid).toISOString().split("T")[0] : "");
      setShift(member.shift ?? "");
      setClassificationDate(member.classificationDate ? new Date(member.classificationDate).toISOString().split("T")[0] : "");
      setSmsEnabled((member as any).smsEnabled ?? false);
      setEmailEnabled((member as any).emailEnabled ?? true);
      setPushEnabled((member as any).pushEnabled ?? true);
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
          seniorityDate: seniorityDate || null,
          duesStatus: duesStatus || "current",
          duesLastPaid: duesLastPaid || null,
          shift: shift || null,
          classificationDate: classificationDate || null,
          smsEnabled,
          emailEnabled,
          pushEnabled,
        } as any,
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

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("category", uploadCategory);
      if (uploadDescription.trim()) formData.append("description", uploadDescription.trim());

      const res = await fetch(`/api/members/${id}/files`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Upload failed");
      }
      await queryClient.invalidateQueries({ queryKey: filesQueryKey });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadDescription("");
      setUploadCategory("general");
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const displayedFiles =
    activeCategory === "all"
      ? allFiles
      : allFiles.filter((f) => f.category === activeCategory);

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
          {can("members.edit") && (
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
          )}
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
                "Join Date",
                format(new Date(member.joinDate), "MMM d, yyyy")
              )}
            {member.seniorityDate &&
              field(
                "Seniority Date",
                format(new Date(member.seniorityDate), "MMM d, yyyy")
              )}
            {member.classificationDate &&
              field(
                "Classification Date",
                format(new Date(member.classificationDate), "MMM d, yyyy")
              )}
            {member.shift && field("Shift", member.shift)}
            {field(
              "Dues Status",
              <span className={
                member.duesStatus === "delinquent"
                  ? "font-semibold text-red-600"
                  : member.duesStatus === "suspended"
                  ? "font-semibold text-amber-600"
                  : "font-semibold text-green-600"
              }>
                {member.duesStatus ? member.duesStatus.charAt(0).toUpperCase() + member.duesStatus.slice(1) : "Current"}
              </span>
            )}
            {member.duesLastPaid &&
              field(
                "Dues Last Paid",
                format(new Date(member.duesLastPaid), "MMM d, yyyy")
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

        {/* ─── Member Files ──────────────────────────────────────────── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Files
            </p>
            {can("members.edit") && (
              <button
                className="text-xs font-bold text-primary uppercase tracking-wider"
                onClick={() => setUploadOpen(true)}
              >
                + Upload
              </button>
            )}
          </div>

          {/* Category filter tabs */}
          {allFiles.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {(["all", "general", "discipline", "grievance"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "shrink-0 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors",
                    activeCategory === cat
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                  {cat !== "all" && (
                    <span className="ml-1 opacity-60">
                      {allFiles.filter((f) => f.category === cat).length}
                    </span>
                  )}
                  {cat === "all" && (
                    <span className="ml-1 opacity-60">{allFiles.length}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {isLoadingFiles ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : !displayedFiles.length ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center">
              <Paperclip className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">
                {allFiles.length ? "No files in this category" : "No files uploaded yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedFiles.map((file) => (
                <div
                  key={file.id}
                  className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{file.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                          CATEGORY_COLORS[file.category as MemberFileCategory] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {CATEGORY_LABELS[file.category as MemberFileCategory] ?? file.category}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatBytes(file.fileSize)}
                        {file.fileSize ? " · " : ""}
                        {format(new Date(file.uploadedAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    {file.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{file.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={downloadUrl(file.objectPath)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={file.filename}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                    </a>
                    {can("members.edit") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors">
                            <Trash2 className="w-4 h-4 text-destructive/70" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[320px] rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete file?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{file.filename}" will be permanently removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col gap-2">
                            <AlertDialogCancel className="w-full rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteFileMutation.mutate(file.id)}
                              className="bg-destructive hover:bg-destructive/90 w-full rounded-xl"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger zone — remove member */}
        {member && can("members.edit") && (
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
                  Join Date
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
                  Seniority Date
                </label>
                <Input
                  type="date"
                  value={seniorityDate}
                  onChange={(e) => setSeniorityDate(e.target.value)}
                  className="h-12 rounded-xl bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Classification Date
                </label>
                <Input
                  type="date"
                  value={classificationDate}
                  onChange={(e) => setClassificationDate(e.target.value)}
                  className="h-12 rounded-xl bg-card"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Shift
                </label>
                <Input
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  placeholder="Days / Nights"
                  className="h-12 rounded-xl bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Dues Last Paid
                </label>
                <Input
                  type="date"
                  value={duesLastPaid}
                  onChange={(e) => setDuesLastPaid(e.target.value)}
                  className="h-12 rounded-xl bg-card"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Dues Status
              </label>
              <select
                value={duesStatus}
                onChange={(e) => setDuesStatus(e.target.value)}
                className="flex h-12 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm ring-offset-background"
              >
                <option value="current">Current</option>
                <option value="delinquent">Delinquent</option>
                <option value="suspended">Suspended</option>
                <option value="exempt">Exempt</option>
              </select>
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

            {/* Notification Preferences */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Notification Preferences
              </label>
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {[
                  { key: "email", label: "Email Notifications", value: emailEnabled, set: setEmailEnabled },
                  { key: "sms", label: "SMS Notifications", value: smsEnabled, set: setSmsEnabled },
                  { key: "push", label: "Push Notifications", value: pushEnabled, set: setPushEnabled },
                ].map(({ key, label, value, set }) => (
                  <label key={key} className="flex items-center justify-between px-4 py-3 cursor-pointer">
                    <span className="text-sm text-foreground">{label}</span>
                    <div
                      onClick={() => set(!value)}
                      className={`relative w-10 h-6 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-1"}`} />
                    </div>
                  </label>
                ))}
              </div>
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

      {/* Upload sheet */}
      <Sheet open={uploadOpen} onOpenChange={(o) => { if (!uploading) setUploadOpen(o); }}>
        <SheetContent side="bottom" className="h-auto max-h-[85dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">Upload File</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 pb-8">
            {/* File picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                File *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              {uploadFile ? (
                <div className="h-12 rounded-xl bg-card border border-border px-4 flex items-center justify-between">
                  <span className="text-sm font-medium truncate flex-1">{uploadFile.name}</span>
                  <button
                    onClick={() => { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-xl gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  Choose File
                </Button>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Category
              </label>
              <div className="flex gap-2">
                {(["general", "discipline", "grievance"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setUploadCategory(cat)}
                    className={cn(
                      "flex-1 h-11 rounded-xl text-sm font-semibold border transition-colors",
                      uploadCategory === cat
                        ? "bg-foreground text-background border-foreground"
                        : "bg-card text-foreground border-border"
                    )}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Description (optional)
              </label>
              <Input
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Brief description..."
                className="h-12 rounded-xl bg-card"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={() => setUploadOpen(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upload"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
