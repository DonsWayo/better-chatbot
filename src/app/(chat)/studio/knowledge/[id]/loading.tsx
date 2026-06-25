import { Skeleton } from "ui/skeleton";

export default function KnowledgeDetailLoading() {
  return (
    <div className="p-8 flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
