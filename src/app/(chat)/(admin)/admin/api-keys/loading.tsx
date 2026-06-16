import { Skeleton } from "ui/skeleton";

export default function ApiKeysLoading() {
  return (
    <div className="p-8 flex flex-col gap-4">
      <Skeleton className="h-10 w-32" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
