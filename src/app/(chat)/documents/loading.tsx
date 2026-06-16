import { Skeleton } from "ui/skeleton";

export default function DocumentsLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-2">
      <Skeleton className="h-10 w-48 mb-6" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
