import { Skeleton } from "ui/skeleton";

export default function GuardrailsLoading() {
  return (
    <div className="p-8 flex flex-col gap-4">
      <Skeleton className="h-10 w-44" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
