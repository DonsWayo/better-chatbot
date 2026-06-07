import { Skeleton } from "ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";

export default function Loading() {
  const skeletonRows = Array.from({ length: 5 }, (_, i) => i);

  return (
    <div className="space-y-6 w-full">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>

      {/* Model table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <div className="rounded-lg border bg-card w-full overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Model</TableHead>
                <TableHead className="font-semibold">Provider</TableHead>
                <TableHead className="font-semibold text-right">Requests</TableHead>
                <TableHead className="font-semibold text-right">Prompt Tokens</TableHead>
                <TableHead className="font-semibold text-right">Completion Tokens</TableHead>
                <TableHead className="font-semibold text-right">Cost USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skeletonRows.map((index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-40 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Task class table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <div className="rounded-lg border bg-card w-full overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Task Class</TableHead>
                <TableHead className="font-semibold text-right">Requests</TableHead>
                <TableHead className="font-semibold text-right">Cost USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skeletonRows.slice(0, 3).map((index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
