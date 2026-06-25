import { Skeleton } from "ui/skeleton";

export default function RunDetailLoading() {
  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-20 rounded-full ml-auto" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}
