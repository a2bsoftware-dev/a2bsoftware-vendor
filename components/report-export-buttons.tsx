"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

const FORMATS = [
  { format: "csv", label: "CSV", icon: FileDown },
  { format: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { format: "pdf", label: "PDF", icon: FileText }
] as const;

// Plain anchor-triggered navigation rather than fetch+blob - the endpoint
// already sets Content-Disposition: attachment, so the browser downloads
// instead of navigating away, and cookies still ride along on this top-level
// GET (SameSite=Lax) even though API_BASE_URL is a different origin than this
// app's own - no need for a JS-mediated blob download at all.
export default function ReportExportButtons() {
  const handleExport = (format: string) => {
    const link = document.createElement("a");
    link.href = `${API_BASE_URL}/api/vendor/reports/export?format=${format}`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="flex items-center gap-2">
      {FORMATS.map(({ format, label, icon: Icon }) => (
        <Button
          key={format}
          onClick={() => handleExport(format)}
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 text-xs border-zinc-200 dark:border-zinc-800"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Button>
      ))}
    </div>
  );
}
