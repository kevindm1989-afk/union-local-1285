import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ChevronLeft, Users, ClipboardList, CheckCircle, XCircle,
  Plus, ShieldCheck, ShieldOff, RefreshCw, Loader2, Eye, EyeOff, Copy, Settings, Mail, History, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Tab = "requests" | "users" | "roles" | "config" | "audit";

interface AccessRequest {
  id: number;
  name: string;
  username: string;
  reason: string | null;
  createdAt: string;
}

interface AppUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const fetchJson = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
};

export default function Admin() {
  const [tab, setTab] = useState<Tab>("requests");
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Access Requests ─────────────────────────────────────────────────────────
  const { data: requests = [], isLoading: loadingRequests } = useQuery<AccessRequest[]>({
    queryKey: ["/auth/access-requests"],
    queryFn: () => fetchJson("/api/auth/access-requests"),
  });

  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [denyTarget, setDenyTarget] = useState<AccessRequest | null>(null);
  const [tempPassword, setTempPassword] = useState<{ display: string; username: string } | null>(null);
  const [showPass, setShowPass] = useState(false);

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson(`/api/auth/access-requests/${id}/approve`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/auth/access-requests"] });
      qc.invalidateQueries({ queryKey: ["/auth/users"] });
      setApprovingId(null);
      setTempPassword({ display: data.tempPassword, username: data.user.username });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const denyMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson(`/api/auth/access-requests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/auth/access-requests"] });
      setDenyTarget(null);
      toast({ title: "Request denied", description: "Access request removed." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Users ────────────────────────────────────────────────────────────────────
  const { data: users = [], isLoading: loadingUsers } = useQuery<AppUser[]>({
    queryKey: ["/auth/users"],
    queryFn: () => fetchJson("/api/auth/users"),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"steward" | "chair" | "admin" | "member">("steward");
  const [newLinkedMemberId, setNewLinkedMemberId] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [createdCred, setCreatedCred] = useState<{ username: string; password: string } | null>(null);

  const { data: membersList = [] } = useQuery<{ id: number; name: string; employeeId: string | null }[]>({
    queryKey: ["/members/list-simple"],
    queryFn: () => fetchJson("/api/members?limit=500&simple=1"),
    select: (d: any) => (Array.isArray(d.data) ? d.data : []).map((m: any) => ({ id: m.id, name: m.name, employeeId: m.employeeId })),
  });

  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null);

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      fetchJson(`/api/auth/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/auth/users"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createUser = useMutation({
    mutationFn: (body: object) =>
      fetchJson("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars: any) => {
      qc.invalidateQueries({ queryKey: ["/auth/users"] });
      setCreatedCred({ username: vars.username, password: vars.password });
      setCreateOpen(false);
      setNewName(""); setNewUsername(""); setNewPassword(""); setNewRole("steward"); setNewLinkedMemberId("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      fetchJson(`/api/auth/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      if (resetTarget) setResetResult({ username: resetTarget.username, password: resetPass });
      setResetTarget(null);
      setResetPass("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    if (!newName.trim() || !newUsername.trim() || !newPassword.trim()) return;
    const body: Record<string, unknown> = { displayName: newName, username: newUsername, password: newPassword, role: newRole };
    if (newRole === "member" && newLinkedMemberId) body.linkedMemberId = parseInt(newLinkedMemberId, 10);
    createUser.mutate(body);
  };

  // ── Role Permissions ────────────────────────────────────────────────────────
  const { data: rolesData, isLoading: loadingRoles } = useQuery<{
    allPermissions: string[];
    rolePermissions: Record<string, Record<string, boolean>>;
  }>({
    queryKey: ["/auth/roles/permissions"],
    queryFn: () => fetchJson("/api/auth/roles/permissions"),
  });

  const togglePermission = useMutation({
    mutationFn: (vars: { role: string; permission: string; granted: boolean }) =>
      fetchJson("/api/auth/roles/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/auth/roles/permissions"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
    "members.view":       { label: "View Members",        desc: "Browse and search member records" },
    "members.edit":       { label: "Edit Members",        desc: "Add, edit, and remove member records" },
    "grievances.view":    { label: "View Grievances",     desc: "View filed grievances and their status" },
    "grievances.file":    { label: "File Grievances",     desc: "File new grievances and update existing ones" },
    "grievances.manage":  { label: "Manage Grievances",   desc: "Delete grievances and override steps" },
    "bulletins.view":     { label: "View Bulletins",      desc: "Read posted bulletins and announcements" },
    "bulletins.post":     { label: "Post Bulletins",      desc: "Create new bulletins and announcements" },
    "bulletins.manage":   { label: "Manage Bulletins",    desc: "Edit and delete any bulletin" },
    "documents.view":     { label: "View Documents",      desc: "Access and download CBA documents" },
    "documents.upload":   { label: "Upload Documents",    desc: "Upload, edit, and delete CBA documents" },
  };

  const ROLE_LABELS: Record<string, string> = { chair: "Chair", steward: "Steward" };

  // ── Settings ─────────────────────────────────────────────────────────────────
  type SettingsMap = Record<string, { value: string; description: string | null }>;
  const { data: settingsData, isLoading: loadingSettings } = useQuery<SettingsMap>({
    queryKey: ["/settings"],
    queryFn: () => fetchJson("/api/settings"),
    enabled: tab === "config",
  });

  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [settingsDirty, setSettingsDirty] = useState(false);

  // ── Push Notifications ────────────────────────────────────────────────────
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const sendPush = useMutation({
    mutationFn: () =>
      fetchJson("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pushTitle, body: pushBody }),
      }),
    onSuccess: () => {
      toast({ title: "Notification sent to all stewards" });
      setPushTitle("");
      setPushBody("");
    },
    onError: () => toast({ title: "Failed to send notification", variant: "destructive" }),
  });

  const saveSettings = useMutation({
    mutationFn: (body: Record<string, string>) =>
      fetchJson("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/settings"] });
      setSettingsDirty(false);
      toast({ title: "Settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Audit Logs ───────────────────────────────────────────────────────────────
  interface AuditLogRow {
    id: number;
    action: string;
    entity_type: string;
    entity_id: number;
    ip_address: string | null;
    created_at: string;
    actor_name: string | null;
  }
  const [auditEntityType, setAuditEntityType] = useState<string>("all");
  const { data: auditData, isLoading: loadingAudit, refetch: refetchAudit } = useQuery<{ logs: AuditLogRow[]; total: number }>({
    queryKey: ["/audit-logs", auditEntityType],
    queryFn: () =>
      fetchJson(`/api/audit-logs?limit=50${auditEntityType !== "all" ? `&entityType=${auditEntityType}` : ""}`),
    enabled: tab === "audit",
  });

  function initSettings(data: SettingsMap) {
    const init: Record<string, string> = {};
    for (const key of ["admin_email", "portal_url",
      "grievance_deadline_step_1", "grievance_deadline_step_2",
      "grievance_deadline_step_3", "grievance_deadline_step_4",
      "grievance_deadline_step_5"]) {
      init[key] = data[key]?.value ?? "";
    }
    setSettingsForm(init);
    setSettingsDirty(false);
  }

  useEffect(() => {
    if (settingsData && Object.keys(settingsForm).length === 0) {
      initSettings(settingsData);
    }
  }, [settingsData]);

  function settingField(key: string, v: string) {
    setSettingsForm((p) => ({ ...p, [key]: v }));
    setSettingsDirty(true);
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Copied", description: "Copied to clipboard." });
  };

  const CredentialCard = ({
    title, username, password, onClose,
  }: { title: string; username: string; password: string; onClose: () => void }) => (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-card border border-border rounded-2xl p-5 w-full max-w-[400px] shadow-2xl space-y-4">
        <h3 className="font-extrabold text-base tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">
          Share these credentials with the steward. They should change their password after first login.
        </p>
        <div className="space-y-3">
          <div className="bg-muted rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Username</p>
              <p className="font-mono font-bold text-sm text-foreground mt-0.5">{username}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(username)}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="bg-muted rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {title.includes("Reset") ? "New Password" : "Temporary Password"}
              </p>
              <p className="font-mono font-bold text-sm text-foreground mt-0.5">{password}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(password)}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <Button className="w-full h-11 rounded-xl font-bold" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );

  return (
    <MobileLayout>
      <div className="p-4 space-y-5 pb-10">
        {/* Header */}
        <header className="flex items-center gap-3 mt-1">
          <Link
            href="/"
            className="w-10 h-10 flex items-center justify-center bg-card rounded-full shadow-sm border border-border shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold tracking-tight">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Manage steward accounts &amp; access</p>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          {([
            { id: "requests" as Tab, label: "Requests", icon: ClipboardList, count: requests.length },
            { id: "users" as Tab, label: "Stewards", icon: Users, count: null },
            { id: "roles" as Tab, label: "Roles", icon: Settings, count: null },
            { id: "config" as Tab, label: "Config", icon: Mail, count: null },
            { id: "audit" as Tab, label: "Audit", icon: History, count: null },
          ]).map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition-all",
                tab === id
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              {count !== null && count > 0 && (
                <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Access Requests Tab */}
        {tab === "requests" && (
          <section className="space-y-3">
            {loadingRequests ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : requests.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
                <ClipboardList className="w-9 h-9 mx-auto mb-3 text-muted-foreground opacity-20" />
                <p className="text-sm font-semibold text-muted-foreground">No pending requests</p>
                <p className="text-xs text-muted-foreground/60 mt-1">New access requests will appear here</p>
              </div>
            ) : (
              requests.map((r) => (
                <div
                  key={r.id}
                  className="bg-card border border-border rounded-xl p-4 space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-foreground">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(r.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">@{r.username}</p>
                    {r.reason && (
                      <p className="text-xs text-foreground/70 mt-1.5 italic">&ldquo;{r.reason}&rdquo;</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-9 rounded-xl gap-1.5 font-bold"
                      onClick={() => setApprovingId(r.id)}
                      disabled={approveMutation.isPending && approvingId === r.id}
                    >
                      {approveMutation.isPending && approvingId === r.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-9 rounded-xl gap-1.5 font-bold text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() => setDenyTarget(r)}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Deny
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <section className="space-y-3">
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                className="h-9 rounded-xl gap-1.5 font-bold"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Add Steward
              </Button>
            </div>

            {loadingUsers ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-extrabold text-primary uppercase">
                        {u.displayName.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-sm text-foreground truncate">{u.displayName}</p>
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                          {u.role === "admin" ? "Admin" : u.role === "chair" ? "Chair" : "Steward"}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
                            u.isActive
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">@{u.username}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg"
                        title="Reset password"
                        onClick={() => setResetTarget(u)}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "h-8 w-8 rounded-lg",
                          u.isActive
                            ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            : "text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20"
                        )}
                        title={u.isActive ? "Deactivate" : "Activate"}
                        onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                        disabled={toggleActive.isPending}
                      >
                        {u.isActive ? (
                          <ShieldOff className="w-3.5 h-3.5" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Roles Tab */}
        {tab === "roles" && (
          <section className="space-y-4 pb-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Control what each role can see and do in the app. The Chair always has full access.
            </p>

            {loadingRoles ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rolesData ? (
              (["chair", "steward"] as const).map((roleKey) => (
                <div key={roleKey} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <p className="font-extrabold text-sm tracking-tight">{ROLE_LABELS[roleKey]}</p>
                  </div>
                  <div className="divide-y divide-border">
                    {rolesData.allPermissions.map((perm) => {
                      const granted = rolesData.rolePermissions[roleKey]?.[perm] ?? false;
                      const meta = PERMISSION_LABELS[perm];
                      return (
                        <div key={perm} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-tight">{meta?.label ?? perm}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{meta?.desc}</p>
                          </div>
                          <button
                            onClick={() => togglePermission.mutate({ role: roleKey, permission: perm, granted: !granted })}
                            disabled={togglePermission.isPending}
                            className={cn(
                              "relative w-11 h-6 rounded-full transition-colors shrink-0",
                              granted ? "bg-primary" : "bg-muted-foreground/30"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                                granted && "translate-x-5"
                              )}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : null}
          </section>
        )}

        {/* Config / Settings Tab */}
        {tab === "config" && (
          <section className="space-y-4">
            {loadingSettings ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Notifications */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <p className="font-extrabold text-sm tracking-tight">Email Notifications</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Emails sent via Resend when grievances are filed or updated</p>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Admin Notification Email</label>
                      <Input
                        type="email"
                        placeholder="steward@local1285.org"
                        value={settingsForm["admin_email"] ?? ""}
                        onChange={(e) => settingField("admin_email", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Receives new grievance and access request notifications</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Portal URL</label>
                      <Input
                        type="url"
                        placeholder="https://union-local-1285.fly.dev"
                        value={settingsForm["portal_url"] ?? ""}
                        onChange={(e) => settingField("portal_url", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Used for links in notification emails</p>
                    </div>
                  </div>
                </div>

                {/* Push Notifications */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <p className="font-extrabold text-sm tracking-tight">Send Push Notification</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Broadcast an instant notification to all stewards</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
                      <Input
                        placeholder="e.g. Important Update"
                        value={pushTitle}
                        onChange={(e) => setPushTitle(e.target.value)}
                        className="h-11 rounded-xl bg-muted/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message</label>
                      <Input
                        placeholder="e.g. Please attend tomorrow's meeting..."
                        value={pushBody}
                        onChange={(e) => setPushBody(e.target.value)}
                        className="h-11 rounded-xl bg-muted/50"
                      />
                    </div>
                    <Button
                      className="w-full h-11 rounded-xl font-bold gap-2"
                      disabled={!pushTitle || !pushBody || sendPush.isPending}
                      onClick={() => sendPush.mutate()}
                    >
                      <Bell className="w-4 h-4" />
                      {sendPush.isPending ? "Sending..." : "Send to All Stewards"}
                    </Button>
                  </div>
                </div>

                {/* Grievance Deadlines */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <p className="font-extrabold text-sm tracking-tight">Grievance Step Deadlines</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Days from filing to due date for each step</p>
                  </div>
                  <div className="divide-y divide-border">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <div key={step} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{step === 5 ? "Step 5 — Arbitration" : `Step ${step}`}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            className="w-20 text-center h-9"
                            value={settingsForm[`grievance_deadline_step_${step}`] ?? ""}
                            onChange={(e) => settingField(`grievance_deadline_step_${step}`, e.target.value)}
                          />
                          <span className="text-xs text-muted-foreground w-8">days</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full h-12 rounded-xl font-bold"
                  disabled={!settingsDirty || saveSettings.isPending}
                  onClick={() => saveSettings.mutate(settingsForm)}
                >
                  {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Settings"}
                </Button>
              </>
            )}
          </section>
        )}

        {/* Audit Log Tab */}
        {tab === "audit" && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <select
                className="flex-1 h-9 rounded-xl border border-border bg-card text-sm px-3 font-medium"
                value={auditEntityType}
                onChange={(e) => setAuditEntityType(e.target.value)}
              >
                <option value="all">All Entities</option>
                <option value="member">Members</option>
                <option value="grievance">Grievances</option>
                <option value="user">Users</option>
              </select>
              <button
                onClick={() => refetchAudit()}
                className="h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {loadingAudit ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !auditData?.logs.length ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
                <History className="w-9 h-9 mx-auto mb-3 text-muted-foreground opacity-20" />
                <p className="text-sm font-semibold text-muted-foreground">No audit events yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditData.logs.map((log) => {
                  const ACTION_COLORS: Record<string, string> = {
                    create: "bg-green-100 text-green-700 border-green-200",
                    update: "bg-blue-100 text-blue-700 border-blue-200",
                    delete: "bg-red-100 text-red-700 border-red-200",
                  };
                  return (
                    <div key={log.id} className="bg-card border border-border rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded border", ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground border-border")}>
                          {log.action}
                        </span>
                        <span className="text-xs font-semibold capitalize">{log.entity_type} #{log.entity_id}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {format(new Date(log.created_at), "MMM d 'at' h:mm a")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        by <span className="font-medium text-foreground">{log.actor_name ?? "System"}</span>
                        {log.ip_address ? ` · ${log.ip_address}` : ""}
                      </p>
                    </div>
                  );
                })}
                {auditData.total > 50 && (
                  <p className="text-xs text-center text-muted-foreground pt-1">Showing latest 50 of {auditData.total} events</p>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Approve Confirm */}
      <AlertDialog open={approvingId !== null} onOpenChange={(o) => { if (!o) setApprovingId(null); }}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Access?</AlertDialogTitle>
            <AlertDialogDescription>
              A steward account will be created and a temporary password generated for you to share.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogCancel className="w-full rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="w-full rounded-xl font-bold"
              onClick={() => approvingId !== null && approveMutation.mutate(approvingId)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve & Create Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deny Confirm */}
      <AlertDialog open={denyTarget !== null} onOpenChange={(o) => { if (!o) setDenyTarget(null); }}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Deny Request?</AlertDialogTitle>
            <AlertDialogDescription>
              The access request from <strong>{denyTarget?.name}</strong> will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogCancel className="w-full rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 w-full rounded-xl"
              onClick={() => denyTarget && denyMutation.mutate(denyTarget.id)}
              disabled={denyMutation.isPending}
            >
              {denyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Deny Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create User Sheet */}
      <Sheet open={createOpen} onOpenChange={(o) => { if (!createUser.isPending) setCreateOpen(o); }}>
        <SheetContent side="bottom" className="h-auto max-h-[92dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">Add Account</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pb-8">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Role</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: "steward", label: "Steward" },
                  { value: "chair", label: "Chair" },
                  { value: "member", label: "Member" },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setNewRole(value); setNewLinkedMemberId(""); }}
                    className={cn(
                      "flex-1 h-11 rounded-xl text-sm font-bold border transition-all min-w-[80px]",
                      newRole === value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {newRole === "member" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Member accounts access the self-service portal only.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Smith" className="h-12 rounded-xl bg-card" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                placeholder="jsmith"
                autoCapitalize="none"
                className="h-12 rounded-xl bg-card font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Temporary password"
                  className="h-12 rounded-xl bg-card pr-12"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPass((v) => !v)}
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {newRole === "member" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Link to Member Record (optional)
                </label>
                <select
                  value={newLinkedMemberId}
                  onChange={(e) => setNewLinkedMemberId(e.target.value)}
                  className="w-full h-12 rounded-xl bg-card border border-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— No member record linked —</option>
                  {membersList.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.name}{m.employeeId ? ` (#${m.employeeId})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={handleCreate}
                disabled={createUser.isPending || !newName.trim() || !newUsername.trim() || !newPassword.trim()}
              >
                {createUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reset Password Sheet */}
      <Sheet open={resetTarget !== null} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetPass(""); } }}>
        <SheetContent side="bottom" className="h-auto rounded-t-2xl">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">
              Reset Password — {resetTarget?.displayName}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pb-8">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Password</label>
              <div className="relative">
                <Input
                  type={showResetPass ? "text" : "password"}
                  value={resetPass}
                  onChange={(e) => setResetPass(e.target.value)}
                  placeholder="Enter new password"
                  className="h-12 rounded-xl bg-card pr-12"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowResetPass((v) => !v)}
                >
                  {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setResetTarget(null)}>Cancel</Button>
              <Button
                className="flex-1 h-12 rounded-xl font-bold"
                disabled={resetPassword.isPending || !resetPass.trim()}
                onClick={() => resetTarget && resetPassword.mutate({ id: resetTarget.id, password: resetPass })}
              >
                {resetPassword.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set Password"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Temporary password reveal cards */}
      {tempPassword && (
        <CredentialCard
          title="Account Created"
          username={tempPassword.username}
          password={tempPassword.display}
          onClose={() => { setTempPassword(null); setShowPass(false); }}
        />
      )}
      {createdCred && (
        <CredentialCard
          title="Account Created"
          username={createdCred.username}
          password={createdCred.password}
          onClose={() => setCreatedCred(null)}
        />
      )}
      {resetResult && (
        <CredentialCard
          title="Password Reset"
          username={resetResult.username}
          password={resetResult.password}
          onClose={() => setResetResult(null)}
        />
      )}
    </MobileLayout>
  );
}
