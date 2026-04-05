import { useListMembers, getListMembersQueryKey } from "@workspace/api-client-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Search, Phone, Mail, ChevronRight, User } from "lucide-react";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

function useLocalDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function Members() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useLocalDebounce(search, 300);

  const { data: members, isLoading } = useListMembers(
    { search: debouncedSearch || undefined },
    { query: { queryKey: getListMembersQueryKey({ search: debouncedSearch || undefined }) } }
  );

  return (
    <MobileLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Members</h1>
          <p className="text-muted-foreground mt-1">Directory & contacts</p>
        </header>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="Search by name, ID, or department..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card border-border shadow-sm text-base"
          />
        </div>

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
          ) : members?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No members found</p>
            </div>
          ) : (
            members?.map((member) => (
              <Link key={member.id} href={`/members/${member.id}`} className="block transition-transform active:scale-[0.98]">
                <Card className="shadow-sm border-border hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-lg">{member.name}</span>
                        {!member.isActive && (
                          <span className="text-[10px] uppercase font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inactive</span>
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
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
