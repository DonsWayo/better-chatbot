import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import { Skeleton } from "ui/skeleton";

function KnowledgeTableSkeleton() {
  const skeletonRows = Array.from({ length: 4 }, (_, i) => i);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="rounded-lg border bg-card w-full overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Visibility</TableHead>
              <TableHead className="font-semibold">Team</TableHead>
              <TableHead className="font-semibold">Created At</TableHead>
              <TableHead className="font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skeletonRows.map((index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="space-y-1">
                    <Skeleton
                      className={`h-4 ${index % 2 === 0 ? "w-40" : "w-56"}`}
                    />
                    <Skeleton
                      className={`h-3 ${index % 2 === 0 ? "w-56" : "w-64"}`}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton
                    className={`h-4 ${index % 2 === 0 ? "w-24" : "w-28"}`}
                  />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function Loading() {
  return <KnowledgeTableSkeleton />;
}
