import { useState, useRef } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useListDocuments,
  useCreateDocument,
  useDeleteDocument,
  useUpdateDocument,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  FileText, Upload, Trash2, ExternalLink, CheckCircle2, Loader2, Star,
  Search, Lock, History, RefreshCw, ChevronRight,
} from "lucide-react";
import { usePermissions } from "@/App";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type UploadStep = "idle" | "file-selected" | "working" | "done" | "error";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "cba", label: "CBA" },
  { id: "moa", label: "MOA" },
  { id: "bylaw", label: "Bylaws" },
  { id: "policy", label: "Policy" },
  { id: "form", label: "Forms" },
  { id: "guide", label: "Guides" },
] as const;
type CategoryId = typeof CATEGORIES[number]["id"];

interface VersionEntry {
  id: number;
  title: string;
  versionNumber: number;
  changeNote: string | null;
  isCurrent: boolean;
  documentGroupId: number;
  objectPath: string;
  filename: string;
  fileSize: string | null;
  effectiveDate: string | null;
  uploaderName: string | null;
  uploadedAt: string | null;
  stewardOnly: boolean;
}

interface NewVersionTarget {
  id: number;
  title: string;
  groupId: number;
  currentVersion: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadFileToServer(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ objectPath: string; filename: string; contentType: string; fileSize: number }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/storage/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 90));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Invalid server response")); }
      } else {
        try { const err = JSON.parse(xhr.responseText); reject(new Error(err.error || `Upload failed (${xhr.status})`)); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 120_000;
    xhr.send(formData);
  });
}

export default function Documents() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload sheet state ────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [uploadCategory, setUploadCategory] = useState<string>("cba");
  const [changeNote, setChangeNote] = useState("");
  const [newVersionOf, setNewVersionOf] = useState<NewVersionTarget | null>(null);

  // ── List + filter state ──────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Version history sheet state ──────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDoc, setHistoryDoc] = useState<{ title: string; groupId: number } | null>(null);
  const [historyVersions, setHistoryVersions] = useState<VersionEntry[]>([]);

  const { data: documents, isLoading } = useListDocuments({
    query: { queryKey: getListDocumentsQueryKey() },
  });
  const { can } = usePermissions();
  const invalidateDocs = () => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });

  const createDocument = useCreateDocument({ mutation: { onSuccess: invalidateDocs } });
  const deleteDocument = useDeleteDocument({ mutation: { onSuccess: invalidateDocs } });
  const updateDocument = useUpdateDocument({ mutation: { onSuccess: invalidateDocs } });

  const resetSheet = () => {
    setUploadStep("idle");
    setSelectedFile(null);
    setTitle("");
    setDescription("");
    setEffectiveDate("");
    setUploadCategory("cba");
    setUploadError(null);
    setUploadProgress(0);
    setStatusText("");
    setChangeNote("");
    setNewVersionOf(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openNewVersion = (doc: any) => {
    setNewVersionOf({
      id: doc.id,
      title: doc.title,
      groupId: doc.documentGroupId ?? doc.id,
      currentVersion: doc.versionNumber ?? 1,
    });
    setTitle(doc.title);
    setUploadCategory(doc.category ?? "cba");
    setUploadStep("idle");
    setSheetOpen(true);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!newVersionOf) setTitle((prev) => prev || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    setUploadStep("file-selected");
    setUploadError(null);
  };

  const handleUploadAndSave = async () => {
    if (!selectedFile || !title.trim()) return;
    setUploadStep("working");
    setUploadError(null);
    setUploadProgress(0);
    setStatusText("Uploading file...");
    try {
      const result = await uploadFileToServer(selectedFile, (pct) => setUploadProgress(pct));
      setUploadProgress(95);
      setStatusText(newVersionOf ? "Saving new version..." : "Saving document record...");

      const payload: any = {
        title: title.trim(),
        category: uploadCategory,
        description: description.trim() || undefined,
        filename: result.filename,
        objectPath: result.objectPath,
        contentType: result.contentType,
        fileSize: formatFileSize(result.fileSize),
        isCurrent: true,
        effectiveDate: effectiveDate || null,
      };
      if (newVersionOf) {
        payload.parentDocumentId = newVersionOf.id;
        if (changeNote.trim()) payload.changeNote = changeNote.trim();
      }

      await createDocument.mutateAsync({ data: payload as any });
      setUploadProgress(100);
      setUploadStep("done");
      setTimeout(() => { setSheetOpen(false); resetSheet(); }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadError(msg);
      setUploadStep("error");
    }
  };

  const handleSetCurrent = (id: number) => {
    const doc = documents?.find((d) => d.id === id) as any;
    if (doc) {
      const groupId = doc.documentGroupId ?? doc.id;
      documents?.forEach((d) => {
        const dGroupId = (d as any).documentGroupId ?? d.id;
        if (d.isCurrent && d.id !== id && dGroupId === groupId) {
          updateDocument.mutate({ id: d.id, data: { isCurrent: false } });
        }
      });
    }
    updateDocument.mutate({ id, data: { isCurrent: true } });
  };

  const handleDelete = (id: number) => deleteDocument.mutate({ id });

  const handleOpenDocument = (doc: { objectPath: string }) => {
    window.open(`/api/storage${doc.objectPath}`, "_blank", "noopener");
  };

  const handleViewHistory = async (doc: any) => {
    const groupId = doc.documentGroupId ?? doc.id;
    setHistoryDoc({ title: doc.title, groupId });
    setHistoryVersions([]);
    setHistoryLoading(true);
    setHistoryOpen(true);
    try {
      const res = await fetch(`/api/documents/group/${groupId}/versions`);
      const data: VersionEntry[] = await res.json();
      setHistoryVersions(data);
    } catch {
      setHistoryVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Filtered + grouped documents ─────────────────────────────────────────
  const filteredDocs = (documents ?? []).filter((d) => {
    const matchesCategory = activeCategory === "all" || (d as any).category === activeCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || d.title.toLowerCase().includes(q) || (d.description ?? "").toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  // Group by documentGroupId — each group shows its current version as the lead
  const groups = new Map<number, any[]>();
  for (const doc of filteredDocs) {
    const gid = (doc as any).documentGroupId ?? doc.id;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid)!.push(doc);
  }

  // Build display groups: lead = current version (isCurrent=true), or highest versionNumber
  const displayGroups = Array.from(groups.values()).map((versions) => {
    const lead = versions.find((v) => v.isCurrent) ?? versions.reduce((a: any, b: any) =>
      ((a.versionNumber ?? 1) >= (b.versionNumber ?? 1) ? a : b));
    const archived = versions.filter((v: any) => !v.isCurrent);
    return { lead, archived, versionCount: versions.length };
  });

  const currentGroups = displayGroups.filter((g) => g.lead.isCurrent);
  const archivedGroups = displayGroups.filter((g) => !g.lead.isCurrent);

  return (
    <MobileLayout>
      <div className="p-5 space-y-5">
        <header className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Documents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Union Library</p>
          </div>
          {can("documents.upload") && (
            <Button
              size="sm"
              className="rounded-xl h-10 gap-1.5 font-bold text-xs uppercase tracking-wider shrink-0"
              onClick={() => { resetSheet(); setSheetOpen(true); }}
            >
              <Upload className="w-4 h-4" /> Upload
            </Button>
          )}
        </header>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all",
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="py-16 text-center bg-card border border-dashed border-border rounded-xl">
            <FileText className="w-14 h-14 mx-auto text-muted-foreground opacity-20 mb-4" />
            <p className="font-semibold text-muted-foreground">
              {activeCategory === "all" ? "No documents yet" : `No ${CATEGORIES.find(c => c.id === activeCategory)?.label} documents`}
            </p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Upload documents to give stewards quick access.</p>
            {can("documents.upload") && (
              <Button onClick={() => { resetSheet(); setSheetOpen(true); }} className="rounded-xl gap-2">
                <Upload className="w-4 h-4" /> Upload Document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── Current (active) documents ── */}
            {currentGroups.length > 0 && (
              <section className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {currentGroups.length === 1 && currentGroups[0].lead.category === "cba"
                    ? "Current Agreement"
                    : "Active Documents"}
                </p>
                {currentGroups.map(({ lead, archived, versionCount }) => (
                  <DocumentCard
                    key={lead.id}
                    doc={lead as any}
                    versionCount={versionCount}
                    archivedCount={archived.length}
                    isLead
                    canManage={can("documents.upload")}
                    onOpen={() => handleOpenDocument(lead)}
                    onDelete={() => handleDelete(lead.id)}
                    onNewVersion={() => openNewVersion(lead)}
                    onViewHistory={() => handleViewHistory(lead)}
                  />
                ))}
              </section>
            )}

            {/* ── Archived/other documents ── */}
            {archivedGroups.length > 0 && (
              <section className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Other Documents</p>
                {archivedGroups.map(({ lead, archived, versionCount }) => (
                  <DocumentCard
                    key={lead.id}
                    doc={lead as any}
                    versionCount={versionCount}
                    archivedCount={archived.length}
                    isLead={false}
                    canManage={can("documents.upload")}
                    onOpen={() => handleOpenDocument(lead)}
                    onDelete={() => handleDelete(lead.id)}
                    onSetCurrent={() => handleSetCurrent(lead.id)}
                    onNewVersion={() => openNewVersion(lead)}
                    onViewHistory={() => handleViewHistory(lead)}
                  />
                ))}
              </section>
            )}
          </div>
        )}
      </div>

      {/* ── Upload / New Version Sheet ───────────────────────────────────────── */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open && uploadStep === "working") return;
          setSheetOpen(open);
          if (!open) resetSheet();
        }}
      >
        <SheetContent side="bottom" className="h-auto max-h-[92dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">
              {newVersionOf ? `New Version — ${newVersionOf.title}` : "Upload Document"}
            </SheetTitle>
            {newVersionOf && (
              <p className="text-sm text-muted-foreground -mt-1">
                Currently on <span className="font-semibold text-foreground">v{newVersionOf.currentVersion}</span>. This will become{" "}
                <span className="font-semibold text-primary">v{newVersionOf.currentVersion + 1}</span> and archive the existing version.
              </p>
            )}
          </SheetHeader>

          {uploadStep === "done" ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
              <p className="font-bold text-lg">{newVersionOf ? "New version saved" : "Document uploaded"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {newVersionOf
                  ? `v${newVersionOf.currentVersion + 1} is now the active version.`
                  : "The document is now available to stewards."}
              </p>
            </div>
          ) : uploadStep === "working" ? (
            <div className="py-8 space-y-5 text-center pb-8">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">{statusText}</p>
              {uploadProgress > 0 && (
                <div className="mx-4">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              {/* Category — only shown for new standalone documents */}
              {!newVersionOf && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.filter(c => c.id !== "all").map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setUploadCategory(cat.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                          uploadCategory === cat.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* File picker */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  {newVersionOf ? "Replacement File (PDF or Word)" : "File (PDF or Word document)"}
                </label>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileSelected} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors",
                    selectedFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  {selectedFile ? (
                    <div>
                      <FileText className="w-8 h-8 text-primary mx-auto mb-2" />
                      <p className="text-sm font-semibold text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(selectedFile.size)} — tap to change</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium text-muted-foreground">Tap to select PDF or Word doc</p>
                    </div>
                  )}
                </button>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 2024–2027 Collective Bargaining Agreement"
                  className="h-12 rounded-xl bg-card"
                />
              </div>

              {/* Change note — only shown for new versions */}
              {newVersionOf && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    What Changed <span className="text-muted-foreground font-normal normal-case">(optional)</span>
                  </label>
                  <Textarea
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    placeholder="e.g. Updated wage schedule in Articles 18–22, new grievance timelines in Article 8"
                    className="min-h-[72px] rounded-xl bg-card resize-none"
                  />
                </div>
              )}

              {/* Notes / Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Notes <span className="text-muted-foreground font-normal normal-case">(optional)</span>
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Ratified March 2024"
                  className="min-h-[60px] rounded-xl bg-card resize-none"
                />
              </div>

              {/* Effective date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Effective Date <span className="text-muted-foreground font-normal normal-case">(optional)</span>
                </label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="h-12 rounded-xl bg-card"
                />
              </div>

              {uploadError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                  <p className="text-sm text-destructive">{uploadError}</p>
                </div>
              )}

              <Button
                className="w-full h-12 rounded-xl font-bold text-base mt-2"
                onClick={handleUploadAndSave}
                disabled={!selectedFile || !title.trim()}
              >
                {newVersionOf
                  ? <><RefreshCw className="w-4 h-4 mr-2" /> Save as v{newVersionOf.currentVersion + 1}</>
                  : <><Upload className="w-4 h-4 mr-2" /> Upload & Save</>
                }
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Version History Sheet ────────────────────────────────────────────── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85dvh] rounded-t-2xl flex flex-col">
          <SheetHeader className="mb-4 shrink-0">
            <SheetTitle className="text-lg font-extrabold tracking-tight">Version History</SheetTitle>
            {historyDoc && (
              <p className="text-sm text-muted-foreground -mt-1">{historyDoc.title}</p>
            )}
          </SheetHeader>
          <div className="overflow-y-auto flex-1 space-y-2.5 pb-4">
            {historyLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            ) : historyVersions.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No version history found.</div>
            ) : (
              historyVersions.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "rounded-xl border p-3.5",
                    v.isCurrent
                      ? "bg-primary/5 border-primary/20"
                      : "bg-card border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          v.isCurrent
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : "bg-muted text-muted-foreground"
                        )}>
                          v{v.versionNumber} {v.isCurrent ? "— Current" : "— Archived"}
                        </span>
                        {v.stewardOnly && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                            <Lock className="w-2.5 h-2.5" /> Stewards
                          </span>
                        )}
                      </div>
                      {v.changeNote && (
                        <p className="text-sm text-foreground leading-snug mt-0.5">{v.changeNote}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                        {v.effectiveDate && <span>Effective {v.effectiveDate}</span>}
                        {v.fileSize && <span>{v.fileSize}</span>}
                        {v.uploadedAt && <span>{format(new Date(v.uploadedAt), "MMM d, yyyy")}</span>}
                        {v.uploaderName && <span>by {v.uploaderName}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={v.isCurrent ? "default" : "ghost"}
                      className="h-9 gap-1.5 rounded-lg text-xs shrink-0"
                      onClick={() => window.open(`/api/storage${v.objectPath}`, "_blank", "noopener")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}

// ─── Document Card Component ──────────────────────────────────────────────────
interface DocCardProps {
  doc: any;
  versionCount: number;
  archivedCount: number;
  isLead: boolean;
  canManage: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onNewVersion: () => void;
  onViewHistory: () => void;
  onSetCurrent?: () => void;
}

function DocumentCard({
  doc, versionCount, archivedCount, isLead, canManage,
  onOpen, onDelete, onNewVersion, onViewHistory, onSetCurrent,
}: DocCardProps) {
  const vNum = doc.versionNumber ?? 1;
  const hasHistory = versionCount > 1;

  if (isLead) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header row: badges */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Star className="w-3.5 h-3.5 text-primary fill-primary shrink-0" />
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Active</span>
              <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                v{vNum} — Current
              </span>
              {hasHistory && (
                <button onClick={onViewHistory} className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground">
                  <History className="w-3 h-3" />
                  {versionCount} versions
                  <ChevronRight className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
            {/* Title + lock */}
            <div className="flex items-center gap-2">
              <p className="font-bold text-foreground leading-tight text-base">{doc.title}</p>
              {doc.stewardOnly && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                  <Lock className="w-2.5 h-2.5" /> Stewards
                </span>
              )}
            </div>
            {doc.description && (
              <p className="text-sm text-muted-foreground mt-1 leading-snug">{doc.description}</p>
            )}
            {doc.changeNote && (
              <p className="text-xs text-muted-foreground mt-1 italic leading-snug">"{doc.changeNote}"</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
              {doc.effectiveDate && <span>Effective {doc.effectiveDate}</span>}
              {doc.expirationDate && <span>Expires {doc.expirationDate}</span>}
              {doc.fileSize && <span>{doc.fileSize}</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Uploaded {format(new Date(doc.uploadedAt), "MMMM d, yyyy")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" className="rounded-lg h-9 gap-1.5 text-xs" onClick={onOpen}>
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </Button>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg h-9 gap-1 text-xs border-primary/30 text-primary"
                onClick={onNewVersion}
              >
                <RefreshCw className="w-3.5 h-3.5" /> New Version
              </Button>
            )}
            {canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-9 w-full p-0 rounded-lg text-destructive hover:bg-destructive/10 text-xs gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-[320px] rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {versionCount > 1
                        ? `This will delete v${vNum}. The other ${archivedCount} version(s) will remain.`
                        : "This action cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col gap-2">
                    <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive w-full">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Non-current document card
  return (
    <div className="bg-card border border-border rounded-xl p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              v{vNum}
            </span>
            <p className="font-semibold text-foreground text-sm leading-tight">{doc.title}</p>
            {doc.stewardOnly && (
              <Lock className="w-3 h-3 text-amber-600 shrink-0" aria-label="Stewards only" />
            )}
          </div>
          {doc.effectiveDate && (
            <p className="text-xs text-muted-foreground mt-0.5">Effective {doc.effectiveDate}</p>
          )}
          {hasHistory && (
            <button onClick={onViewHistory} className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground mt-0.5">
              <History className="w-3 h-3" />{versionCount} versions<ChevronRight className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {canManage && onSetCurrent && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-primary" title="Set as current" onClick={onSetCurrent}>
              <Star className="w-4 h-4" />
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-primary" title="Upload new version" onClick={onNewVersion}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={onOpen}>
            <ExternalLink className="w-4 h-4" />
          </Button>
          {canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[320px] rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete document?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2">
                  <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive w-full">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
