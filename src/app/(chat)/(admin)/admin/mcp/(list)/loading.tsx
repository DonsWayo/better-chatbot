import { Skeleton } from "ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="rounded-lg border bg-card w-full overflow-x-auto">
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
