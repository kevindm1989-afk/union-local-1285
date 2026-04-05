import { useGetMember, useGetMemberGrievances, getGetMemberQueryKey, getGetMemberGrievancesQueryKey } from "@workspace/api-client-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParams, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, Building, Briefcase, Calendar, FileText, ChevronLeft, ArrowRight } from "lucide-react";
import { format } from "date-fns";

export default function MemberDetail() {
  const params = useParams();
  const id = Number(params.id);

  const { data: member, isLoading: isLoadingMember } = useGetMember(id, { 
    query: { enabled: !!id, queryKey: getGetMemberQueryKey(id) } 
  });

  const { data: grievances, isLoading: isLoadingGrievances } = useGetMemberGrievances(id, {
    query: { enabled: !!id, queryKey: getGetMemberGrievancesQueryKey(id) }
  });

  return (
    <MobileLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <header className="flex items-center gap-3">
          <Link href="/members" className="w-10 h-10 flex items-center justify-center bg-card rounded-full shadow-sm border border-border">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            {isLoadingMember ? (
              <Skeleton className="h-8 w-2/3" />
            ) : (
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{member?.name}</h1>
            )}
          </div>
        </header>

        {isLoadingMember ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : member && (
          <Card className="shadow-sm border-border">
            <CardContent className="p-0 divide-y divide-border">
              {member.employeeId && (
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Employee ID</span>
                  <span className="font-semibold">{member.employeeId}</span>
                </div>
              )}
              
              <div className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Building className="w-4 h-4" /> Department
                </span>
                <span className="font-semibold text-right">{member.department || "—"}</span>
              </div>
              
              <div className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Classification
                </span>
                <span className="font-semibold text-right">{member.classification || "—"}</span>
              </div>
              
              <div className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Phone
                </span>
                {member.phone ? (
                  <a href={`tel:${member.phone}`} className="font-semibold text-primary">{member.phone}</a>
                ) : <span>—</span>}
              </div>
              
              <div className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email
                </span>
                {member.email ? (
                  <a href={`mailto:${member.email}`} className="font-semibold text-primary">{member.email}</a>
                ) : <span>—</span>}
              </div>

              {member.joinDate && (
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Seniority Date
                  </span>
                  <span className="font-semibold">{format(new Date(member.joinDate), 'MMM d, yyyy')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {member?.notes && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</h2>
            <Card className="shadow-sm bg-muted/30">
              <CardContent className="p-4 text-sm whitespace-pre-wrap">
                {member.notes}
              </CardContent>
            </Card>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Grievance History</h2>
            <Link href={`/grievances/new?memberId=${id}`} className="text-sm text-primary font-medium flex items-center">
              File new
            </Link>
          </div>
          
          {isLoadingGrievances ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : grievances?.length === 0 ? (
            <Card className="shadow-sm border-dashed">
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>No grievances filed</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {grievances?.map((g) => (
                <Link key={g.id} href={`/grievances/${g.id}`} className="block transition-transform active:scale-[0.98]">
                  <Card className="shadow-sm border-border hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-foreground">{g.title}</div>
                        <div className="text-sm text-muted-foreground mt-1 flex gap-2 items-center">
                          <span>{g.grievanceNumber}</span>
                          <span>•</span>
                          <span>Step {g.step}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase font-bold bg-muted px-2 py-1 rounded">
                          {g.status.replace('_', ' ')}
                        </span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </MobileLayout>
  );
}
