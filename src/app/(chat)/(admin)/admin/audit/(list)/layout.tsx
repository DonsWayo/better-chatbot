import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";

export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative bg-background w-full flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="space-y-4 w-full max-w-none">
          <Card className="w-full border-none bg-transparent animate-in fade-in slide-in-from-bottom-2 duration-500">
            <CardHeader>
              <CardTitle className="font-display text-2xl font-semibold tracking-tight">
                Compliance Audit Log
              </CardTitle>
              <CardDescription>
                Immutable record of all system events. Retained for 6 months.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 md:p-6 w-full">{children}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
