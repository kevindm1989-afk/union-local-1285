import { useParams, useLocation, Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useGetAnnouncement,
  useDeleteAnnouncement,
  getGetAnnouncementQueryKey,
  getListAnnouncementsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Trash2, Bell } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const categoryColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 border-red-200",
  contract: "bg-blue-100 text-blue-800 border-blue-200",
  meeting: "bg-purple-100 text-purple-800 border-purple-200",
  action: "bg-orange-100 text-orange-800 border-orange-200",
  general: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function BulletinDetail() {
  const { id } = useParams<{ id: string }>();
  const announcementId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: announcement, isLoading } = useGetAnnouncement(announcementId, {
    query: { enabled: !!announcementId, queryKey: getGetAnnouncementQueryKey(announcementId) },
  });

  const deleteAnnouncement = useDeleteAnnouncement();

  const handleDelete = () => {
    deleteAnnouncement.mutate({ id: announcementId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        setLocation("/bulletins");
      },
    });
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-5 space-y-4">
          <Skeleton className="h-8 w-3/4 rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </MobileLayout>
    );
  }

  if (!announcement) return null;

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/bulletins" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold text-sm uppercase tracking-wider">Bulletin</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[320px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this bulletin?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2">
                <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive w-full">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        <div className="p-5 space-y-5 flex-1">
          {announcement.isUrgent && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-2.5">
              <Bell className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-sm font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Urgent Announcement</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded border", categoryColors[announcement.category])}>
                {announcement.category}
              </span>
              <span className="text-xs text-muted-foreground">{format(new Date(announcement.publishedAt), "MMMM d, yyyy 'at' h:mm a")}</span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground leading-snug">{announcement.title}</h1>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{announcement.content}</p>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
