import { Skeleton } from "ui/skeleton";

export default function RolePacksLoading() {
  return (
    <div className="p-8 flex flex-col gap-4">
      <Skeleton className="h-10 w-36" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
