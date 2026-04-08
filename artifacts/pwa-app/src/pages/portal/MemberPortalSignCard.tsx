import { useRef, useEffect, useState } from "react";
import SignaturePad from "signature_pad";
import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PenLine, RotateCcw, CheckCircle2, Loader2, Shield } from "lucide-react";
import { format } from "date-fns";

type MemberProfile = { signedAt: string | null; name: string };

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function MemberPortalSignCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const { data: profile } = useQuery<MemberProfile>({
    queryKey: ["/member-portal/profile"],
    queryFn: () => fetchJson("/api/member-portal/profile"),
    select: (d: any) => ({ signedAt: d.signedAt, name: d.name }),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);

    const pad = new SignaturePad(canvas, {
      penColor: "#1a3a5c",
      backgroundColor: "rgba(0,0,0,0)",
      minWidth: 1.5,
      maxWidth: 3,
    });

    pad.addEventListener("endStroke", () => setIsEmpty(pad.isEmpty()));
    padRef.current = pad;

    return () => pad.off();
  }, []);

  const signMutation = useMutation({
    mutationFn: (signatureData: string) =>
      fetchJson("/api/member-portal/sign-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/member-portal/profile"] });
      toast({ title: "Union card signed!", description: "Your signature has been recorded." });
    },
    onError: () => toast({ title: "Failed to save signature", variant: "destructive" }),
  });

  const handleSign = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast({ title: "Please sign the card first", variant: "destructive" });
      return;
    }
    const dataUrl = pad.toDataURL("image/png");
    signMutation.mutate(dataUrl);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);

    pad.clear();
    setIsEmpty(true);
  };

  if (profile?.signedAt) {
    return (
      <MemberPortalLayout>
        <div className="p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          <div>
            <h1 className="text-xl font-bold text-foreground">Union Card</h1>
            <p className="text-xs text-muted-foreground">Digital membership card</p>
          </div>
          <Card className="border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10">
            <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">Card Signed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Signed on {format(new Date(profile.signedAt), "MMMM d, yyyy")}
                </p>
              </div>
              <div className="w-full border border-green-200 dark:border-green-800/50 rounded-xl p-4 bg-background">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Union Local 1285</p>
                <p className="text-base font-bold text-foreground mt-1">{profile.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Member in Good Standing</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">Your Rights</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  As a union member, you are protected by the collective agreement. Contact your steward for any workplace issues.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </MemberPortalLayout>
    );
  }

  return (
    <MemberPortalLayout>
      <div className="p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sign Your Union Card</h1>
          <p className="text-xs text-muted-foreground">Complete your membership by signing below</p>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Union Local 1285 — Membership Card</CardTitle>
            <p className="text-xs text-muted-foreground">
              By signing, you confirm your membership and agreement to abide by the union's constitution and bylaws.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Sign Here</p>
              <div className="relative border-2 border-dashed border-border rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                <canvas
                  ref={canvasRef}
                  className="w-full"
                  style={{ height: 160, touchAction: "none" }}
                />
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-xs text-muted-foreground/50 flex items-center gap-1.5">
                      <PenLine className="w-3.5 h-3.5" /> Sign with your finger or stylus
                    </p>
                  </div>
                )}
              </div>
              <div className="border-t border-border mt-1" />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 text-xs h-8 flex-1">
                <RotateCcw className="w-3.5 h-3.5" /> Clear
              </Button>
              <Button size="sm" onClick={handleSign} disabled={isEmpty || signMutation.isPending} className="gap-1.5 text-xs h-8 flex-1">
                {signMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Submit Signature
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MemberPortalLayout>
  );
}
