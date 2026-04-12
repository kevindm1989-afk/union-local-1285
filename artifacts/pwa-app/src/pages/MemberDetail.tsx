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
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useParams, Link, useLocation } from "wouter";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { usePermissions, useAuth } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone, Mail, Building, Briefcase, Calendar,
  FileText, ChevronLeft, ArrowRight, Pencil, Trash2, Loader2,
  Paperclip, Download, Upload, X, AlertOctagon, ClipboardCheck, Plus,
  UserX, UserCheck, ShieldAlert, KeyRound, ShieldCheck, Eye, EyeOff, Copy,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

type MemberFileCategory = "general" | "discipline" | "grievance";

interface DisciplineRecord {
  id: number;
  memberId: number;
  disciplineType: string;
  incidentDate: string;
  issuedDate: string;
  description: string;
  responseFiled: boolean;
  grievanceId: number | null;
  createdAt: string;
}

interface OnboardingChecklist {
  id: number;
  memberId: number;
  cardSigned: boolean;
  duesExplained: boolean;
  cbaProvided: boolean;
  stewardIntroduced: boolean;
  rightsExplained: boolean;
  benefitsExplained: boolean;
  completedAt: string | null;
  completedCount: number;
  total: number;
  isComplete: boolean;
}

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
};

const DISCIPLINE_TYPE_LABELS: Record<string, string> = {
  verbal_warning: "Verbal Warning",
  written_warning: "Written Warning",
  suspension_paid: "Suspension (Paid)",
  suspension_unpaid: "Suspension (Unpaid)",
  termination: "Termination",
  other: "Other",
};

const DISCIPLINE_COLORS: Record<string, string> = {
  verbal_warning: "bg-amber-100 text-amber-800 border-amber-200",
  written_warning: "bg-orange-100 text-orange-800 border-orange-200",
  suspension_paid: "bg-red-100 text-red-800 border-red-200",
  suspension_unpaid: "bg-red-200 text-red-900 border-red-300",
  termination: "bg-gray-900 text-white border-gray-900",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const ONBOARDING_ITEMS: Array<{ key: keyof OnboardingChecklist; label: string; description: string }> = [
  { key: "cardSigned", label: "Membership Card Signed", description: "Member has signed their union membership card" },
  { key: "duesExplained", label: "Dues Explained", description: "Member understands dues structure and payment" },
  { key: "cbaProvided", label: "CBA Provided", description: "Member received a copy of the collective agreement" },
  { key: "stewardIntroduced", label: "Steward Introduced", description: "Member has met their shop steward" },
  { key: "rightsExplained", label: "Rights Explained", description: "Member understands their workplace rights" },
  { key: "benefitsExplained", label: "Benefits Explained", description: "Member understands their benefits coverage" },
];

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
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const isAdmin = authUser?.role === "admin" || authUser?.role === "chair";

  const [activeTab, setActiveTab] = useState<"overview" | "files" | "account">("overview");

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

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
  const [seniorityRank, setSeniorityRank] = useState<string>("");
  const [cardSigned, setCardSigned] = useState(false);
  const [accommodationActive, setAccommodationActive] = useState(false);
  const [stewardNotes, setStewardNotes] = useState("");

  // Files state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<MemberFileCategory>("general");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MemberFileCategory | "all">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Discipline state
  const [showAddDiscipline, setShowAddDiscipline] = useState(false);
  const [newDiscType, setNewDiscType] = useState("verbal_warning");
  const [newDiscIncidentDate, setNewDiscIncidentDate] = useState(new Date().toISOString().split("T")[0]);
  const [newDiscIssuedDate, setNewDiscIssuedDate] = useState(new Date().toISOString().split("T")[0]);
  const [newDiscDescription, setNewDiscDescription] = useState("");

  const { data: member, isLoading } = useGetMember(id, {
    query: { enabled: !!id, queryKey: getGetMemberQueryKey(id) },
  });

  const { data: grievances, isLoading: isLoadingGrievances } = useGetMemberGrievances(id, {
    query: { enabled: !!id, queryKey: getGetMemberGrievancesQueryKey(id) },
  });

  const updateMember = useUpdateMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setEditOpen(false);
        setSaving(false);
      },
      onError: () => setSaving(false),
    },
  });

  const deleteMember = useDeleteMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setLocation("/members");
      },
      onError: () => {
        toast({ title: "Delete failed", description: "Could not delete member. Please try again.", variant: "destructive" });
      },
    },
  });

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

  // ── Discipline queries ──
  const disciplineKey = ["member-discipline", id];
  const { data: disciplineRecords = [], isLoading: isLoadingDiscipline } = useQuery<DisciplineRecord[]>({
    queryKey: disciplineKey,
    queryFn: () => fetchJson(`/api/members/${id}/discipline`),
    enabled: !!id,
  });

  const addDisciplineMutation = useMutation({
    mutationFn: (body: object) => fetchJson(`/api/members/${id}/discipline`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: disciplineKey });
      setShowAddDiscipline(false);
      setNewDiscType("verbal_warning"); setNewDiscDescription(""); setNewDiscIncidentDate(new Date().toISOString().split("T")[0]); setNewDiscIssuedDate(new Date().toISOString().split("T")[0]);
    },
  });

  const deleteDisciplineMutation = useMutation({
    mutationFn: (recordId: number) => fetch(`/api/members/${id}/discipline/${recordId}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: disciplineKey }),
  });

  // ── Onboarding queries ──
  const onboardingKey = ["member-onboarding", id];
  const { data: onboarding } = useQuery<OnboardingChecklist | null>({
    queryKey: onboardingKey,
    queryFn: () => fetchJson(`/api/members/${id}/onboarding`),
    enabled: !!id,
  });

  const updateOnboardingMutation = useMutation({
    mutationFn: (body: object) => fetchJson(`/api/members/${id}/onboarding`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: onboardingKey }),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => fetchJson(`/api/members/${id}/deactivate`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
      toast({ title: "Member deactivated", description: "Their portal access has been suspended." });
    },
    onError: () => toast({ title: "Error", description: "Could not deactivate member.", variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => fetchJson(`/api/members/${id}/reactivate`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
      toast({ title: "Member reactivated", description: "Portal access has been restored." });
    },
    onError: () => toast({ title: "Error", description: "Could not reactivate member.", variant: "destructive" }),
  });

  // ── Linked account ──────────────────────────────────────────────────────────
  interface LinkedUser {
    id: number;
    username: string;
    displayName: string;
    role: string;
    isActive: boolean;
    linkedMemberId: number | null;
    lastLoginAt: string | null;
    createdAt: string;
  }

  const [roleChangeOpen, setRoleChangeOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState("");
  const [resetPassOpen, setResetPassOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null);

  const { data: linkedUsers = [], refetch: refetchLinkedUser } = useQuery<LinkedUser[]>({
    queryKey: ["/auth/users/by-member", id],
    queryFn: () => fetchJson(`/api/auth/users?memberId=${id}`),
    enabled: isAdmin && !!id,
  });
  const linkedUser = linkedUsers[0] ?? null;

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      fetchJson(`/api/auth/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      refetchLinkedUser();
      setRoleChangeOpen(false);
      toast({ title: "Role updated", description: `Account role changed to ${pendingRole}.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      fetchJson(`/api/auth/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      if (linkedUser) setResetResult({ username: linkedUser.username, password: newPassword });
      setResetPassOpen(false);
      setNewPassword("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Copied to clipboard" });
  };

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
      setSeniorityDate((member as any).seniorityDate ? new Date((member as any).seniorityDate).toISOString().split("T")[0] : "");
      setDuesStatus((member as any).duesStatus ?? "current");
      setDuesLastPaid((member as any).duesLastPaid ? new Date((member as any).duesLastPaid).toISOString().split("T")[0] : "");
      setShift((member as any).shift ?? "");
      setClassificationDate((member as any).classificationDate ? new Date((member as any).classificationDate).toISOString().split("T")[0] : "");
      setSmsEnabled((member as any).smsEnabled ?? false);
      setEmailEnabled((member as any).emailEnabled ?? true);
      setPushEnabled((member as any).pushEnabled ?? true);
      setSeniorityRank((member as any).seniorityRank != null ? String((member as any).seniorityRank) : "");
      setCardSigned((member as any).cardSigned ?? false);
      setAccommodationActive((member as any).accommodationActive ?? false);
      setStewardNotes((member as any).stewardNotes ?? "");
    }
  }, [member, editOpen]);

  const handleSave = () => {
    if (!name.trim()) return;
    setSaving(true);
    updateMember.mutate({
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
        seniorityRank: seniorityRank ? parseInt(seniorityRank) : null,
        cardSigned,
        accommodationActive,
        stewardNotes: stewardNotes || null,
      } as any,
    });
  };

  const handleDelete = () => {
    deleteMember.mutate({ id });
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

        {/* Tab bar — admins get Overview / Files / Account tabs */}
        {isAdmin && member && (
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {([
              { id: "overview" as const, label: "Overview" },
              { id: "files" as const, label: "Files" },
              { id: "account" as const, label: "Account" },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                  activeTab === id
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Info card */}
        {(!isAdmin || activeTab === "overview") && (isLoading ? (
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
            {(member as any).seniorityDate &&
              field(
                "Seniority Date",
                format(new Date((member as any).seniorityDate), "MMM d, yyyy")
              )}
            {(member as any).classificationDate &&
              field(
                "Classification Date",
                format(new Date((member as any).classificationDate), "MMM d, yyyy")
              )}
            {(member as any).shift && field("Shift", (member as any).shift)}
            {field(
              "Dues Status",
              <span className={
                (member as any).duesStatus === "delinquent"
                  ? "font-semibold text-red-600"
                  : (member as any).duesStatus === "suspended"
                  ? "font-semibold text-amber-600"
                  : "font-semibold text-green-600"
              }>
                {(member as any).duesStatus ? (member as any).duesStatus.charAt(0).toUpperCase() + (member as any).duesStatus.slice(1) : "Current"}
              </span>
            )}
            {(member as any).duesLastPaid &&
              field(
                "Dues Last Paid",
                format(new Date((member as any).duesLastPaid), "MMM d, yyyy")
              )}
            {(member as any).seniorityRank != null && field("Seniority Rank", `#${(member as any).seniorityRank}`)}
            {field(
              "Card Signed",
              (member as any).cardSigned
                ? <span className="font-semibold text-green-600">Yes</span>
                : <span className="font-semibold text-muted-foreground">No</span>
            )}
            {(member as any).accommodationActive != null && field(
              "Accommodation",
              (member as any).accommodationActive
                ? <span className="font-semibold text-amber-600">Active</span>
                : <span className="font-semibold text-muted-foreground">None</span>
            )}
          </div>
        ) : null)}

        {/* Notes */}
        {(!isAdmin || activeTab === "overview") && member?.notes && (
          <div className="bg-muted/40 border border-border rounded-xl px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              General Notes
            </p>
            <p className="text-sm whitespace-pre-wrap text-foreground">{member.notes}</p>
          </div>
        )}

        {/* Steward-privileged notes */}
        {(!isAdmin || activeTab === "overview") && can("members.edit") && (member as any).stewardNotes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1.5">
              🔒 Steward Notes (Private)
            </p>
            <p className="text-sm whitespace-pre-wrap text-foreground">{(member as any).stewardNotes}</p>
          </div>
        )}

        {/* Grievances */}
        {(!isAdmin || activeTab === "overview") && (<section className="space-y-2.5">
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
        </section>)}

        {/* ─── Member Files ──────────────────────────────────────────── */}
        {(!isAdmin || activeTab === "files") && (<section className="space-y-2.5">
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
        </section>)}

        {/* ─── Discipline History ──────────────────────────────────────── */}
        {(!isAdmin || activeTab === "overview") && (<section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Discipline History {disciplineRecords.length > 0 && `(${disciplineRecords.length})`}
              </p>
            </div>
            {can("members.edit") && (
              <button className="text-xs font-bold text-primary uppercase tracking-wider" onClick={() => setShowAddDiscipline(true)}>
                + Add
              </button>
            )}
          </div>

          {isLoadingDiscipline ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : disciplineRecords.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl p-5 text-center">
              <AlertOctagon className="w-7 h-7 mx-auto mb-1.5 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">No discipline records on file</p>
            </div>
          ) : (
            <div className="space-y-2">
              {disciplineRecords.map((r) => (
                <div key={r.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border", DISCIPLINE_COLORS[r.disciplineType] ?? DISCIPLINE_COLORS.other)}>
                        {DISCIPLINE_TYPE_LABELS[r.disciplineType] ?? r.disciplineType}
                      </span>
                      {r.responseFiled && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-green-100 text-green-700 border-green-200">
                          Response Filed
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-snug">{r.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Incident: {r.incidentDate} · Issued: {r.issuedDate}
                    </p>
                    {r.grievanceId && (
                      <Link href={`/grievances/${r.grievanceId}`} className="text-[11px] text-primary font-semibold mt-0.5 block">
                        → Linked Grievance #{r.grievanceId}
                      </Link>
                    )}
                  </div>
                  {can("members.edit") && (
                    <button onClick={() => deleteDisciplineMutation.mutate(r.id)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-0.5">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>)}

        {/* ─── Onboarding Checklist ────────────────────────────────────── */}
        {(!isAdmin || activeTab === "overview") && (<section className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Onboarding Checklist
              {onboarding && ` (${onboarding.completedCount}/${onboarding.total})`}
            </p>
            {onboarding?.isComplete && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-green-100 text-green-700 border-green-200">Complete</span>
            )}
          </div>

          {onboarding && onboarding.completedCount > 0 && (
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={cn("h-1.5 rounded-full transition-all", onboarding.isComplete ? "bg-green-500" : "bg-primary")}
                style={{ width: `${(onboarding.completedCount / onboarding.total) * 100}%` }}
              />
            </div>
          )}

          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {ONBOARDING_ITEMS.map((item) => {
              const checked = Boolean(onboarding && (onboarding as unknown as Record<string, unknown>)[item.key]);
              return (
                <div
                  key={item.key}
                  className={cn("flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors", can("members.edit") ? "" : "pointer-events-none")}
                  onClick={() => {
                    if (!can("members.edit")) return;
                    updateOnboardingMutation.mutate({ [item.key]: !checked });
                  }}
                >
                  <Checkbox checked={checked} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className={cn("text-sm font-semibold", checked ? "text-muted-foreground line-through" : "text-foreground")}>{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>)}

        {/* Account Management */}
        {(!isAdmin || activeTab === "account") && member && can("members.edit") && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-1.5 mb-3">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Management</p>
            </div>

            {/* Linked Account Card (admin only) */}
            {isAdmin && (
              <div className="bg-card border border-border rounded-xl overflow-hidden mb-2">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Portal Account</p>
                </div>
                {!linkedUser ? (
                  <div className="px-4 py-4 text-center">
                    <p className="text-sm text-muted-foreground">No portal account linked</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Approve an access request to create one</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Username</p>
                        <p className="font-mono font-bold text-sm">@{linkedUser.username}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(linkedUser.username)}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Role</p>
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-md mt-0.5 inline-block",
                          linkedUser.role === "admin" ? "bg-red-100 text-red-700" :
                          linkedUser.role === "chair" ? "bg-orange-100 text-orange-700" :
                          linkedUser.role === "steward" ? "bg-blue-100 text-blue-700" :
                          linkedUser.role === "co_chair" ? "bg-violet-100 text-violet-700" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {linkedUser.role === "co_chair" ? "Co-Chair" : linkedUser.role.charAt(0).toUpperCase() + linkedUser.role.slice(1)}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-xs font-bold gap-1"
                        onClick={() => { setPendingRole(linkedUser.role); setRoleChangeOpen(true); }}
                      >
                        Change
                      </Button>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <span className={cn("text-xs font-bold mt-0.5 inline-block", linkedUser.isActive ? "text-green-600" : "text-red-600")}>
                          {linkedUser.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {linkedUser.lastLoginAt && (
                        <p className="text-xs text-muted-foreground">
                          Last login {format(new Date(linkedUser.lastLoginAt), "MMM d")}
                        </p>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-9 rounded-xl gap-2 text-xs font-bold"
                        onClick={() => { setNewPassword(""); setShowNewPass(false); setResetPassOpen(true); }}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Reset Password
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Deactivate / Reactivate */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-11 rounded-xl gap-2",
                    member.isActive
                      ? "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20"
                      : "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20"
                  )}
                  disabled={deactivateMutation.isPending || reactivateMutation.isPending}
                >
                  {member.isActive ? (
                    <><UserX className="w-4 h-4" /> Deactivate Member</>
                  ) : (
                    <><UserCheck className="w-4 h-4" /> Reactivate Member</>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[320px] rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {member.isActive ? "Deactivate" : "Reactivate"} {member.name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {member.isActive
                      ? "This will suspend their portal access and send a notification email if they have one on file. You can reactivate them at any time."
                      : "This will restore their portal access and allow them to log in again."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2">
                  <AlertDialogCancel className="w-full rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={cn("w-full rounded-xl", member.isActive ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700")}
                    onClick={() => member.isActive ? deactivateMutation.mutate() : reactivateMutation.mutate()}
                    disabled={deactivateMutation.isPending || reactivateMutation.isPending}
                  >
                    {(deactivateMutation.isPending || reactivateMutation.isPending) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      member.isActive ? "Deactivate" : "Reactivate"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Delete with name confirmation */}
            <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirmName(""); }}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full h-11 rounded-xl text-destructive hover:bg-destructive/10 gap-2 border border-dashed border-destructive/30"
                >
                  <Trash2 className="w-4 h-4" />
                  Permanently Delete Member
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[340px] rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {member.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the member record, all grievances, discipline records, and associated data. <strong>This cannot be undone.</strong>
                    <br /><br />
                    Type <strong className="font-mono">{member.name}</strong> to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={member.name}
                  className="mx-0 rounded-xl font-mono"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <AlertDialogFooter className="flex-col gap-2">
                  <AlertDialogCancel className="w-full rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive hover:bg-destructive/90 w-full rounded-xl"
                    disabled={deleteMember.isPending || deleteConfirmName.trim() !== member.name.trim()}
                  >
                    {deleteMember.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Permanently Delete"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Role change sheet */}
      <Sheet open={roleChangeOpen} onOpenChange={setRoleChangeOpen}>
        <SheetContent side="bottom" className="h-auto rounded-t-2xl">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">Change Account Role</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 pb-8">
            <p className="text-sm text-muted-foreground">
              Changing role for <span className="font-semibold text-foreground">@{linkedUser?.username}</span>.
              This takes effect immediately on next login.
            </p>
            {(["member", "steward", "co_chair", "chair", "admin"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setPendingRole(r)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors text-left",
                  pendingRole === r
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  r === "admin" ? "bg-red-500" :
                  r === "chair" ? "bg-orange-500" :
                  r === "co_chair" ? "bg-violet-500" :
                  r === "steward" ? "bg-blue-500" : "bg-muted-foreground"
                )} />
                {r === "co_chair" ? "Co-Chair" : r.charAt(0).toUpperCase() + r.slice(1)}
                {linkedUser?.role === r && (
                  <span className="ml-auto text-[10px] font-bold text-muted-foreground uppercase">Current</span>
                )}
              </button>
            ))}
            <Button
              className="w-full h-11 rounded-xl font-bold mt-2"
              disabled={!pendingRole || pendingRole === linkedUser?.role || changeRoleMutation.isPending}
              onClick={() => {
                if (linkedUser && pendingRole) {
                  changeRoleMutation.mutate({ userId: linkedUser.id, role: pendingRole });
                }
              }}
            >
              {changeRoleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Role Change"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Password reset dialog */}
      <Sheet open={resetPassOpen} onOpenChange={(o) => { if (!resetPasswordMutation.isPending) setResetPassOpen(o); }}>
        <SheetContent side="bottom" className="h-auto rounded-t-2xl">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">Reset Password</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pb-8">
            <p className="text-sm text-muted-foreground">
              Set a new temporary password for <span className="font-semibold text-foreground">@{linkedUser?.username}</span>.
              Share it securely — they should change it after logging in.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Password</label>
              <div className="relative">
                <Input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="h-12 rounded-xl pr-12"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowNewPass((v) => !v)}
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <Button
              className="w-full h-11 rounded-xl font-bold"
              disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
              onClick={() => {
                if (linkedUser) resetPasswordMutation.mutate({ userId: linkedUser.id, password: newPassword });
              }}
            >
              {resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set New Password"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reset result overlay */}
      {resetResult && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setResetResult(null)} />
          <div className="relative z-10 bg-card border border-border rounded-2xl p-5 w-full max-w-[400px] shadow-2xl space-y-4">
            <h3 className="font-extrabold text-base tracking-tight">Password Reset</h3>
            <p className="text-sm text-muted-foreground">Share these credentials with the member. They should update their password after logging in.</p>
            <div className="space-y-3">
              <div className="bg-muted rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Username</p>
                  <p className="font-mono font-bold text-sm text-foreground mt-0.5">{resetResult.username}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(resetResult.username)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="bg-muted rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">New Password</p>
                  <p className="font-mono font-bold text-sm text-foreground mt-0.5">{resetResult.password}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(resetResult.password)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <Button className="w-full h-11 rounded-xl font-bold" onClick={() => setResetResult(null)}>Done</Button>
          </div>
        </div>
      )}

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
                General Notes
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any relevant notes..."
                className="min-h-[80px] rounded-xl bg-card resize-none"
              />
            </div>

            {can("members.edit") && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Steward Notes <span className="text-amber-600">(Private)</span>
                </label>
                <Textarea
                  value={stewardNotes}
                  onChange={(e) => setStewardNotes(e.target.value)}
                  placeholder="Private notes visible only to stewards and above..."
                  className="min-h-[80px] rounded-xl bg-card resize-none"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Seniority Rank
                </label>
                <Input
                  type="number"
                  min={1}
                  value={seniorityRank}
                  onChange={(e) => setSeniorityRank(e.target.value)}
                  placeholder="e.g. 42"
                  className="h-12 rounded-xl bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">&nbsp;</label>
                <div className="h-12 rounded-xl bg-card border border-input flex items-center gap-3 px-3">
                  <Checkbox
                    checked={cardSigned}
                    onCheckedChange={(v) => setCardSigned(Boolean(v))}
                    id="edit-card-signed"
                  />
                  <label htmlFor="edit-card-signed" className="text-sm font-medium cursor-pointer">Card Signed</label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer" onClick={() => setAccommodationActive((v) => !v)}>
              <Checkbox checked={accommodationActive} />
              <div>
                <p className="text-sm font-semibold">Accommodation Active</p>
                <p className="text-xs text-muted-foreground">Member has an active disability accommodation</p>
              </div>
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

      {/* Add Discipline Sheet */}
      <Sheet open={showAddDiscipline} onOpenChange={setShowAddDiscipline}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Discipline Record</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4 pb-8">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Discipline Type</label>
              <Select value={newDiscType} onValueChange={setNewDiscType}>
                <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="verbal_warning">Verbal Warning</SelectItem>
                  <SelectItem value="written_warning">Written Warning</SelectItem>
                  <SelectItem value="suspension_paid">Suspension (Paid)</SelectItem>
                  <SelectItem value="suspension_unpaid">Suspension (Unpaid)</SelectItem>
                  <SelectItem value="termination">Termination</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Incident Date</label>
                <Input type="date" value={newDiscIncidentDate} onChange={(e) => setNewDiscIncidentDate(e.target.value)} className="h-12 rounded-xl bg-card" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Issued Date</label>
                <Input type="date" value={newDiscIssuedDate} onChange={(e) => setNewDiscIssuedDate(e.target.value)} className="h-12 rounded-xl bg-card" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
              <Textarea value={newDiscDescription} onChange={(e) => setNewDiscDescription(e.target.value)} placeholder="Describe the disciplinary action..." className="min-h-[80px] rounded-xl bg-card resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setShowAddDiscipline(false)}>Cancel</Button>
              <Button
                className="flex-1 h-12 rounded-xl font-bold"
                disabled={!newDiscDescription.trim() || addDisciplineMutation.isPending}
                onClick={() => addDisciplineMutation.mutate({
                  disciplineType: newDiscType,
                  incidentDate: newDiscIncidentDate,
                  issuedDate: newDiscIssuedDate,
                  description: newDiscDescription.trim(),
                })}
              >
                {addDisciplineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Record"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
