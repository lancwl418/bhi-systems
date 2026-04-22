import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReconciliationLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-5" />
        <div>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
      </div>

      {/* Channel filter */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-md" />
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-28" />
              {i === 3 && (
                <>
                  <Skeleton className="h-2 w-full mt-2 rounded-full" />
                  <Skeleton className="h-3 w-20 mt-1" />
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Table */}
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t">
            <div className="flex gap-4 px-4 py-3 border-b bg-muted/50">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-16 flex-1" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b">
                {Array.from({ length: 9 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-16 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
