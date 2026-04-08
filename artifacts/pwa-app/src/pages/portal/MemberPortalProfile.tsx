import { useState } from "react";
import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { User, Phone, Mail, Calendar, Shield, Award, CheckCircle2, Edit2, X, Save, Loader2 } from "lucide-react";
import { format, differenceInYears } from "date-fns";

type MemberProfile = {
  id: number;
  name: string;
  employeeId: string | null;
  department: string | null;
  classification: string | null;
  phone: string | null;
  email: string | null;
  joinDate: string | null;
  seniorityDate: string | null;
  duesStatus: string | null;
  duesLastPaid: string | null;
  shift: string | null;
  classificationDate: string | null;
  isActive: boolean;
  signedAt: string | null;
};

const duesBadge = (status: string | null) => {
  switch (status) {
    case "current": return { label: "Dues Current", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
    case "delinquent": return { label: "Dues Delinquent", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
    case "suspended": return { label: "Suspended", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" };
    case "exempt": return { label: "Dues Exempt", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" };
    default: return { label: "Status Unknown", color: "bg-muted text-muted-foreground" };
  }
};

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function MemberPortalProfile() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const { data: profile, isLoading } = useQuery<MemberProfile>({
    queryKey: ["/member-portal/profile"],
    queryFn: () => fetchJson("/api/member-portal/profile"),
  });

  const updateMutation = useMutation({
    mutationFn: (body: { phone?: string; email?: string }) =>
      fetchJson("/api/member-portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/member-portal/profile"] });
      setEditing(false);
      toast({ title: "Profile updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const startEdit = () => {
    setPhone(profile?.phone ?? "");
    setEmail(profile?.email ?? "");
    setEditing(true);
  };

  const seniority = profile?.seniorityDate
    ? differenceInYears(new Date(), new Date(profile.seniorityDate))
    : null;

  const dues = duesBadge(profile?.duesStatus ?? null);

  return (
    <MemberPortalLayout>
      <div className="p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Profile</h1>
            <p className="text-xs text-muted-foreground">Union Local</p>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5 text-xs h-8">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : profile ? (
          <>
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{profile.name}</CardTitle>
                    {profile.employeeId && <p className="text-xs text-muted-foreground">#{profile.employeeId}</p>}
                    <div className="flex gap-1 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dues.color}`}>{dues.label}</span>
                      {profile.signedAt && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Card Signed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {profile.department && (
                  <p className="text-xs text-muted-foreground">{profile.department} — {profile.classification}</p>
                )}
                {profile.shift && (
                  <p className="text-xs text-muted-foreground capitalize">{profile.shift} shift</p>
                )}
              </CardContent>
            </Card>

            {seniority !== null && (
              <Card className="border-border/50">
                <CardContent className="px-4 py-3 flex items-center gap-3">
                  <Award className="w-8 h-8 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Seniority</p>
                    <p className="text-lg font-bold text-amber-600">
                      {seniority} year{seniority !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Since {format(new Date(profile.seniorityDate!), "MMMM d, yyyy")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {profile.duesLastPaid && (
              <Card className="border-border/50">
                <CardContent className="px-4 py-3 flex items-center gap-3">
                  <Shield className="w-7 h-7 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Last Dues Payment</p>
                    <p className="text-sm text-foreground">{format(new Date(profile.duesLastPaid), "MMMM d, yyyy")}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {editing ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-9 text-sm" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => updateMutation.mutate({ phone, email })} disabled={updateMutation.isPending} className="flex-1 gap-1.5 text-xs h-8">
                        {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="flex-1 gap-1.5 text-xs h-8">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className={profile.phone ? "text-foreground" : "text-muted-foreground italic"}>
                        {profile.phone ?? "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className={profile.email ? "text-foreground" : "text-muted-foreground italic"}>
                        {profile.email ?? "Not set"}
                      </span>
                    </div>
                    {profile.joinDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground">Joined {format(new Date(profile.joinDate), "MMMM d, yyyy")}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="border-destructive/30">
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              No member record linked. Contact your steward.
            </CardContent>
          </Card>
        )}
      </div>
    </MemberPortalLayout>
  );
}
