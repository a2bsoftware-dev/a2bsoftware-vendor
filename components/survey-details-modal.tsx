"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

// Deliberately excludes client_cpi/vendor_cpi/profit and the pid/gid/vendorName
// columns the admin tool's equivalent modal shows - a vendor viewing their own
// transaction log doesn't need raw internal IDs or a2b's own margin, and
// "supplier" is always themselves here anyway. See VendorDashboardRepository
// (backend) for the matching query-level exclusion.
interface SurveyTransaction {
  id: string;
  project_name: string;
  clientName?: string;
  start_ip_address: string;
  end_ip_address?: string;
  start_time?: string;
  end_time?: string;
  start_date?: string;
  end_date?: string;
  ref_id: string;
  user_id: string;
  country_name?: string;
}

interface SurveyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: SurveyTransaction[];
}

export default function SurveyDetailsModal({ isOpen, onClose, title, data }: SurveyDetailsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] max-h-[90vh] flex flex-col p-6 overflow-hidden bg-white dark:bg-zinc-950">
        <DialogHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-3 flex-shrink-0">
          <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Today&apos;s Statistics - {title} ({data.length})
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            View transaction logs recorded today for this status type.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable table container */}
        <div className="flex-grow overflow-auto my-4 border border-zinc-200 dark:border-zinc-800 rounded-md">
          <Table>
            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-12 text-center font-bold">SN</TableHead>
                <TableHead className="font-bold min-w-[150px]">Project</TableHead>
                <TableHead className="font-bold">Client</TableHead>
                <TableHead className="font-bold">Start IP</TableHead>
                <TableHead className="font-bold">End IP</TableHead>
                <TableHead className="font-bold">Start Time</TableHead>
                <TableHead className="font-bold">End Time</TableHead>
                <TableHead className="font-bold">Start Date</TableHead>
                <TableHead className="font-bold">End Date</TableHead>
                <TableHead className="font-bold">Ref ID</TableHead>
                <TableHead className="font-bold">UID</TableHead>
                <TableHead className="font-bold">Country</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-zinc-500">
                    No transactions found for today.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, index) => (
                  <TableRow key={row.id || index} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                    <TableCell className="text-center text-zinc-500 font-mono text-xs">{index + 1}</TableCell>
                    <TableCell className="text-xs font-semibold max-w-[200px] truncate" title={row.project_name}>
                      {row.project_name}
                    </TableCell>
                    <TableCell className="text-xs">{row.clientName || "NA"}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{row.start_ip_address}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {row.end_ip_address || row.start_ip_address}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.start_time || "NA"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.end_time || "NA"}</TableCell>
                    <TableCell className="text-xs">{row.start_date || "NA"}</TableCell>
                    <TableCell className="text-xs">{row.end_date || "NA"}</TableCell>
                    <TableCell className="font-mono text-[10px] text-zinc-500 truncate max-w-[120px]" title={row.ref_id}>
                      {row.ref_id}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-zinc-500 truncate max-w-[100px]" title={row.user_id}>
                      {row.user_id}
                    </TableCell>
                    <TableCell className="text-xs">{row.country_name || "NA"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex-shrink-0">
          <Button onClick={onClose} className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
