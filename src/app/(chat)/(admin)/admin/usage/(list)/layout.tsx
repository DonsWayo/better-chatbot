import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";

interface UsageLayoutProps {
  children: ReactNode;
}

export default function UsageLayout({ children }: UsageLayoutProps) {
  return (
    <div className="relative bg-background w-full flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="space-y-4 w-full max-w-none">
          <Card className="w-full border-none bg-transparent animate-in fade-in slide-in-from-bottom-2 duration-500">
            <CardHeader>
              <CardTitle className="font-display text-2xl font-semibold tracking-tight">
                Usage Cost Dashboard
              </CardTitle>
              <CardDescription>
                View AI usage and cost breakdown by model and task class
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 md:p-6 w-full">{children}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
