"use client";

import { Button } from "ui/button";
import { Download } from "lucide-react";
import { MyUsageSection } from "@/components/settings/my-usage";

export default function SettingsPage() {
  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* W3: per-user self-serve usage view */}
      <div className="border rounded-lg p-4">
        <MyUsageSection />
      </div>

      <section className="border rounded-lg p-4">
        <h2 className="font-medium mb-2">Data &amp; Privacy</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Download a copy of all your data stored in Asafe AI (GDPR Art. 20 —
          right to data portability).
        </p>
        <a href="/api/user/export" download>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download my data
          </Button>
        </a>
      </section>
    </div>
  );
}
