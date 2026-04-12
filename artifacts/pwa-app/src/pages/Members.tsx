import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Search, Phone, Mail, ChevronRight, User, Download,
  Filter, CheckSquare, Square, Users, UserX, Loader2, Plus, Trash2, Copy,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/App";
import { cn } from "@/lib/utils";

interface Member {
  id: number;
  name: string;
  employeeId: string | null;
  department: string | null;
  classification: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  duesStatus: string | null;
  shift: string | null;
  createdAt: string;
}

const fetchJson = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
};

function useLocalDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

type StatusFilter = "active" | "inactive" | "all";

export default function Members() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useLocalDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [duesFilter, setDuesFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        const res = await fetch(`/api/members/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error(`Failed to delete member ${id}`);
      }
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setSelected(new Set());
      setShowDeleteConfirm(false);
      setBulkMode(false);
      toast({ title: `${ids.length} member${ids.length !== 1 ? "s" : ""} removed` });
    },
    onError: () => toast({ title: "Delete failed", description: "Could not remove one or more members.", variant: "destructive" }),
  });

  const deleteSingleMutation = useMutation({
    mutationFn: async (id: number) => {
      setDeletingId(id);
      const res = await fetch(`/api/members/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast({ title: "Duplicate removed" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    onSettled: () => setDeletingId(null),
  });

  const { data: allMembers = [], isLoading } = useQuery<Member[]>({
    queryKey: ["members", debouncedSearch],
    queryFn: () =>
      fetchJson(`/api/members${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ""}`),
  });

  const departments = [...new Set(allMembers.map((m) => m.department).filter(Boolean) as string[])].sort();

  const members = allMembers.filter((m) => {
    if (statusFilter === "active" && !m.isActive) return false;
    if (statusFilter === "inactive" && m.isActive) return false;
    if (duesFilter !== "all" && (m.duesStatus ?? "current") !== duesFilter) return false;
    if (shiftFilter !== "all" && (m.shift ?? "") !== shiftFilter) return false;
    if (deptFilter && !(m.department ?? "").toLowerCase().includes(deptFilter.toLowerCase())) return false;
    return true;
  });

  const hasFilters = statusFilter !== "active" || duesFilter !== "all" || shiftFilter !== "all" || deptFilter !== "";

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === members.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(members.map((m) => m.id)));
    }
  };

  const exportCsv = async () => {
    setCsvExporting(true);
    try {
      const rows = members.filter((m) => selected.size === 0 || selected.has(m.id));
      const headers = ["ID", "Name", "Employee ID", "Department", "Classification", "Phone", "Email", "Status", "Dues Status", "Shift"];
      const lines = [
        headers.join(","),
        ...rows.map((m) =>
          [
            m.id,
            `"${(m.name ?? "").replace(/"/g, '""')}"`,
            m.employeeId ?? "",
            `"${(m.department ?? "").replace(/"/g, '""')}"`,
            `"${(m.classification ?? "").replace(/"/g, '""')}"`,
            m.phone ?? "",
            m.email ?? "",
            m.isActive ? "Active" : "Inactive",
            m.duesStatus ?? "current",
            m.shift ?? "",
          ].join(",")
        ),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${rows.length} member${rows.length !== 1 ? "s" : ""}` });
    } finally {
      setCsvExporting(false);
    }
  };

  const pendingCount = allMembers.filter((m) => !m.isActive).length;
  const activeCount = allMembers.filter((m) => m.isActive).length;

  const duplicateGroups: Member[][] = Object.values(
    allMembers
      .filter((m) => m.email)
      .reduce<Record<string, Member[]>>((acc, m) => {
        const key = m.email!.toLowerCase().trim();
        if (!acc[key]) acc[key] = [];
        acc[key].push(m);
        return acc;
      }, {})
  ).filter((group) => group.length > 1);

  return (
    <MobileLayout>
      <div className="p-4 sm:p-6 space-y-4 pb-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Members</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Directory & contacts</p>
          </div>
          <div className="flex items-center gap-2">
            {can("members.edit") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl gap-1.5"
                  onClick={() => { setBulkMode((v) => !v); setSelected(new Set()); }}
                >
                  {bulkMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  {bulkMode ? "Done" : "Select"}
                </Button>
                {duplicateGroups.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50 relative"
                    onClick={() => setShowDuplicates((v) => !v)}
                  >
                    <Copy className="w-4 h-4" />
                    {duplicateGroups.length}
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
                  </Button>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              className={cn("h-9 rounded-xl gap-1.5 relative", hasFilters && "border-primary text-primary")}
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="w-4 h-4" />
              Filter
              {hasFilters && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
              )}
            </Button>
          </div>
        </header>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border shadow-sm text-base"
          />
        </div>

        {/* Duplicates panel */}
        {showDuplicates && can("members.edit") && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-amber-700 shrink-0" />
              <p className="text-sm font-bold text-amber-800">
                {duplicateGroups.length} email conflict{duplicateGroups.length !== 1 ? "s" : ""} detected
              </p>
            </div>
            <p className="text-xs text-amber-700">
              Multiple members share the same email address. Keep the correct record and delete the duplicate.
            </p>
            <div className="space-y-3">
              {duplicateGroups.map((group) => (
                <div key={group[0].email} className="bg-white border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-amber-100 border-b border-amber-200">
                    <p className="text-xs font-bold text-amber-800">{group[0].email}</p>
                  </div>
                  {group.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-amber-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID #{m.id}
                          {m.department ? ` · ${m.department}` : ""}
                          {!m.isActive ? " · Inactive" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/members/${m.id}`}>
                          <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs px-2">
                            View
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 rounded-lg text-xs px-2 text-destructive hover:bg-destructive/10 gap-1"
                          onClick={() => deleteSingleMutation.mutate(m.id)}
                          disabled={deleteSingleMutation.isPending && deletingId === m.id}
                        >
                          {deleteSingleMutation.isPending && deletingId === m.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            {/* Status */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</p>
              <div className="flex gap-2">
                {([
                  { value: "active" as StatusFilter, label: "Active", count: activeCount, icon: Users },
                  { value: "inactive" as StatusFilter, label: "Inactive", count: pendingCount, icon: UserX },
                  { value: "all" as StatusFilter, label: "All", count: allMembers.length, icon: null },
                ]).map(({ value, label, count, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-sm font-bold transition-all",
                      statusFilter === value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground"
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    {label}
                    <span className={cn("text-[10px] font-semibold", statusFilter === value ? "opacity-80" : "opacity-60")}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dues Status */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dues Status</p>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { value: "all", label: "All" },
                  { value: "current", label: "Current" },
                  { value: "arrears", label: "Arrears" },
                  { value: "exempt", label: "Exempt" },
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setDuesFilter(value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      duesFilter === value
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shift */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shift</p>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { value: "all", label: "All" },
                  { value: "days", label: "Days" },
                  { value: "afternoons", label: "Afternoons" },
                  { value: "nights", label: "Nights" },
                  { value: "rotating", label: "Rotating" },
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setShiftFilter(value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      shiftFilter === value
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Department */}
            {departments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setDeptFilter("")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      deptFilter === ""
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  {departments.map((dept) => (
                    <button
                      key={dept}
                      onClick={() => setDeptFilter(deptFilter === dept ? "" : dept)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                        deptFilter === dept
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clear all */}
            {hasFilters && (
              <button
                onClick={() => { setStatusFilter("active"); setDuesFilter("all"); setShiftFilter("all"); setDeptFilter(""); }}
                className="text-xs font-bold text-primary underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 rounded-full p-2.5 shrink-0">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Remove {selected.size} member{selected.size !== 1 ? "s" : ""}?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">This permanently deletes all their records, grievances, and data. This cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 rounded-xl gap-1.5"
                  onClick={() => deleteMutation.mutate([...selected])}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleteMutation.isPending ? "Removing…" : "Remove"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk actions bar */}
        {bulkMode && (
          <div className="bg-card border border-border rounded-xl px-4 py-2.5 flex items-center gap-3">
            <button onClick={selectAll} className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
              {selected.size === members.length && members.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </button>
            <div className="flex-1" />
            {can("members.edit") && selected.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg gap-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg gap-1.5 text-xs font-bold"
              onClick={exportCsv}
              disabled={csvExporting}
            >
              {csvExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export CSV
            </Button>
          </div>
        )}

        {/* Export button (non-bulk mode) */}
        {!bulkMode && can("members.edit") && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Loading..." : `${members.length} member${members.length !== 1 ? "s" : ""}`}
              {statusFilter !== "all" && ` · ${statusFilter}`}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg gap-1 text-xs text-muted-foreground"
                onClick={exportCsv}
                disabled={csvExporting}
              >
                {csvExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                CSV
              </Button>
              <Link href="/members/new">
                <Button size="sm" className="h-8 rounded-lg gap-1 text-xs font-bold">
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-3">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i} className="shadow-sm">
                <CardContent className="p-4 flex gap-4">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No members found</p>
              {statusFilter !== "all" && (
                <button
                  className="mt-2 text-sm text-primary font-semibold underline"
                  onClick={() => setStatusFilter("all")}
                >
                  Show all members
                </button>
              )}
            </div>
          ) : (
            members.map((member) => {
              const isSelected = selected.has(member.id);
              const card = (
                <Card
                  key={member.id}
                  className={cn(
                    "shadow-sm border-border transition-colors",
                    bulkMode ? "cursor-pointer" : "hover:border-primary/50",
                    isSelected && "border-primary bg-primary/5"
                  )}
                  onClick={bulkMode ? () => toggleSelect(member.id) : undefined}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    {bulkMode && (
                      <div className="mr-3 shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-primary" />
                        ) : (
                          <Square className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-lg">{member.name}</span>
                        {!member.isActive && (
                          <span className="text-[10px] uppercase font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inactive</span>
                        )}
                        {member.duesStatus === "arrears" && (
                          <span className="text-[10px] uppercase font-bold bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">In Arrears</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {member.department || "No Department"} • {member.classification || "No Class"}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        {member.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {member.phone}
                          </span>
                        )}
                        {member.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {member.email}
                          </span>
                        )}
                      </div>
                    </div>
                    {!bulkMode && <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />}
                  </CardContent>
                </Card>
              );
              return bulkMode ? (
                <div key={member.id}>{card}</div>
              ) : (
                <Link key={member.id} href={`/members/${member.id}`} className="block transition-transform active:scale-[0.98]">
                  {card}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
