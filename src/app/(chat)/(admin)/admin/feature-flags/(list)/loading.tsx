import { Skeleton } from "ui/skeleton";

export default function FeatureFlagsLoading() {
  return (
    <div className="p-8 flex flex-col gap-4">
      <Skeleton className="h-10 w-56" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}
