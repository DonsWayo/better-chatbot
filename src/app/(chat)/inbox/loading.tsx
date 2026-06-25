import { Skeleton } from "ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-10 w-full rounded-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
