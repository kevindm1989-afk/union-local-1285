import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Bell, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Bulletin = {
  id: number;
  title: string;
  content: string;
  category: string;
  isUrgent: boolean;
  publishedAt: string;
};

const categoryColors: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  meeting: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  action: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

const categoryLabel: Record<string, string> = {
  general: "General", urgent: "Urgent", contract: "Contract",
  meeting: "Meeting", action: "Action",
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function MemberPortalBulletins() {
  const { data: bulletins = [], isLoading } = useQuery<Bulletin[]>({
    queryKey: ["/member-portal/bulletins"],
    queryFn: () => fetchJson("/api/member-portal/bulletins"),
  });

  const urgent = bulletins.filter((b) => b.isUrgent);
  const regular = bulletins.filter((b) => !b.isUrgent);

  return (
    <MemberPortalLayout>
      <div className="p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <div>
          <h1 className="text-xl font-bold text-foreground">Bulletins</h1>
          <p className="text-xs text-muted-foreground">Union announcements</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : bulletins.length === 0 ? (
          <Card className="border-dashed border-border/60">
            <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
              <Bell className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No bulletins yet</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {urgent.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Urgent
                </p>
                {urgent.map((b) => (
                  <Card key={b.id} className="border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10">
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-foreground">{b.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{b.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1.5">{format(new Date(b.publishedAt), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {regular.length > 0 && (
              <div className="space-y-2">
                {urgent.length > 0 && <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">All Bulletins</p>}
                {regular.map((b) => (
                  <Card key={b.id} className="border-border/50">
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className={cn("shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5", categoryColors[b.category] ?? categoryColors.general)}>
                          {categoryLabel[b.category] ?? b.category}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{b.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{b.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(b.publishedAt), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </MemberPortalLayout>
  );
}
