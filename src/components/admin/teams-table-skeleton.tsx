import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import { Skeleton } from "ui/skeleton";

export function TeamsTableSkeleton() {
  const skeletonRows = Array.from({ length: 6 }, (_, i) => i);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="rounded-lg border bg-card w-full overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Slug</TableHead>
              <TableHead className="font-semibold">Members</TableHead>
              <TableHead className="font-semibold">Budget Used / Total</TableHead>
              <TableHead className="font-semibold">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skeletonRows.map((index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="space-y-1">
                    <Skeleton
                      className={`h-4 ${index % 3 === 0 ? "w-32" : index % 3 === 1 ? "w-44" : "w-36"}`}
                    />
                    <Skeleton
                      className={`h-3 ${index % 2 === 0 ? "w-56" : "w-64"}`}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton
                    className={`h-5 rounded ${index % 2 === 0 ? "w-24" : "w-32"}`}
                  />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton
                    className={`h-4 ${index % 2 === 0 ? "w-24" : "w-32"}`}
                  />
                </TableCell>
                <TableCell>
                  <Skeleton
                    className={`h-4 ${index % 2 === 0 ? "w-24" : "w-28"}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
