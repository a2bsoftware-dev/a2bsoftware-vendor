"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Receipt, Loader2, Download, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { useModulePermission } from "@/hooks/use-module-permission";

// Matches the "Invoices" entry in ACCESS_RIGHTS_MODULES and MODULE_ID 23 in
// the backend's InvoiceController.
const INVOICES_MODULE_ID = 23;

// Raw snake_case shape from VendorPortalController's /projects
// (VendorDashboardRepository.findProjectsWithCounts) - mapped client-side
// into a local {id, projectName} ProjectOption shape, same as reports/page.tsx.
interface VendorProjectRow {
  id: string;
  project_name: string;
}

interface ProjectOption {
  id: string;
  projectName: string;
}

interface FilterOption {
  value: string;
  label: string;
}

// Last 24 months, newest first, as {value: "yyyy-MM", label: "Jul 2026"} -
// copied verbatim from reports/page.tsx for the same "quick month picker" UX.
function buildMonthOptions(): FilterOption[] {
  const options: FilterOption[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

function monthBounds(yearMonth: string): { fromDate: string; toDate: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { fromDate: fmt(from), toDate: fmt(to) };
}

interface InvoiceLineItemDto {
  projectId: string;
  projectName: string;
  vendorCpi: number;
  completeCount: number;
  reconcileCount: number;
  billableCount: number;
  lineTotal: number;
}

interface InvoiceSummaryDto {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  projectId: string | null;
  projectName: string | null;
  fromDate: string;
  toDate: string;
  currencyName: string | null;
  totalBillableCount: number;
  totalAmount: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  generatedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
}

interface InvoiceDetailDto {
  summary: InvoiceSummaryDto;
  lineItems: InvoiceLineItemDto[];
}

interface InvoicePreviewDto {
  vendorId: string;
  projectId: string | null;
  fromDate: string;
  toDate: string;
  currencyName: string | null;
  totalBillableCount: number;
  totalAmount: number;
  lineItems: InvoiceLineItemDto[];
}

function statusBadgeClass(status: InvoiceSummaryDto["status"]): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400";
    case "APPROVED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400";
    case "REJECTED":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400";
    case "PAID":
      return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400";
  }
}

// currencyName may be null (no project in scope had a currency set) - fall
// back to the bare number rather than printing "null".
function formatMoney(amount: number, currencyName: string | null): string {
  return currencyName ? `${currencyName} ${amount.toFixed(2)}` : amount.toFixed(2);
}

function scopeLabel(projectName: string | null): string {
  return projectName ?? "All Projects";
}

export default function InvoicesPage() {
  const { permission } = useModulePermission(INVOICES_MODULE_ID);

  // Invoices is a vendor's own self-service billing feature, not an
  // admin-configurable module like the rest of the Access Rights list - a
  // "Vendors"-role account always gets full access here regardless of what's
  // (or isn't) set in client_user_priv, so misconfiguring/forgetting that
  // panel entry can never hide a vendor's own invoices from them. Other roles
  // allowed into this portal (Vendor Manager, Admin) still go through the
  // normal permission check below.
  const [isVendor, setIsVendor] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE_URL}/api/auth/me`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.role === "Vendors") setIsVendor(true);
      })
      .catch((err) => console.error("Error checking vendor role", err));
    return () => {
      cancelled = true;
    };
  }, []);
  const canRead = isVendor || permission.read;
  const canCreate = isVendor || permission.create;

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  // Generate-invoice form state - "" means unset for both dates. filterMonth
  // is just a shortcut that fills fromDate/toDate with that whole calendar
  // month's bounds; picking a raw date directly clears it back to "" so the
  // month dropdown never shows a stale label next to a manually-edited range
  // (same interaction as reports/page.tsx's applyMonth/handleFromDateChange).
  const [filterMonth, setFilterMonth] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const selectedProjectId = projectFilter === "all" ? null : projectFilter;

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<InvoicePreviewDto | null>(null);
  const [generating, setGenerating] = useState(false);

  const [invoices, setInvoices] = useState<InvoiceSummaryDto[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<InvoiceDetailDto | null>(null);

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/vendor/projects`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          const items: ProjectOption[] = (data.projects || []).map((p: VendorProjectRow) => ({
            id: p.id,
            projectName: p.project_name,
          }));
          setProjects(items);
        }
      })
      .catch((err) => console.error("Error loading projects", err));
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/invoices`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setInvoices(data.invoices || []);
        } else {
          toast.error("Failed to load invoices");
        }
      } else {
        toast.error("Failed to load invoices");
      }
    } catch (err) {
      console.error("Error loading invoices", err);
      toast.error("Error connecting to server");
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount pattern: loadInvoices's own setLoadingInvoices(true)
    // call is flagged by this rule as if the effect itself sets state, but
    // fetching data on mount is exactly React's documented "synchronize with
    // an external system" use case, not the render-derived-value anti-pattern
    // this rule targets (see the identical suppression in access-rights/page.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInvoices();
  }, [loadInvoices]);

  const applyMonth = (value: string) => {
    setFilterMonth(value);
    if (value === "all" || !value) {
      setFromDate("");
      setToDate("");
    } else {
      const bounds = monthBounds(value);
      setFromDate(bounds.fromDate);
      setToDate(bounds.toDate);
    }
    setPreview(null);
  };

  const handleFromDateChange = (value: string) => {
    setFromDate(value);
    setFilterMonth("");
    setPreview(null);
  };

  const handleToDateChange = (value: string) => {
    setToDate(value);
    setFilterMonth("");
    setPreview(null);
  };

  const handleProjectChange = (value: string | null) => {
    setProjectFilter(value || "all");
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!fromDate || !toDate) {
      toast.error("Select a from and to date first");
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      if (selectedProjectId) params.set("projectId", selectedProjectId);
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/invoices/preview?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPreview(data.preview);
        } else {
          toast.error("Failed to load invoice preview");
        }
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.message || "Failed to load invoice preview");
      }
    } catch (err) {
      console.error("Error loading invoice preview", err);
      toast.error("Error connecting to server");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      toast.error("Select a from and to date first");
      return;
    }
    setGenerating(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate, projectId: selectedProjectId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success(`Invoice ${data.invoice.summary.invoiceNumber} generated`);
          setPreview(null);
          loadInvoices();
        } else {
          toast.error("Failed to generate invoice");
        }
      } else {
        // Spring's default error body shape may differ from the app's usual
        // {success, message} - read defensively rather than assuming a shape.
        const data = await res.json().catch(() => null);
        toast.error(data?.message || "Failed to generate invoice");
      }
    } catch (err) {
      console.error("Error generating invoice", err);
      toast.error("Error connecting to server");
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = async (invoiceId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailInvoice(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDetailInvoice(data.invoice);
        } else {
          toast.error("Failed to load invoice detail");
        }
      } else {
        toast.error("Failed to load invoice detail");
      }
    } catch (err) {
      console.error("Error loading invoice detail", err);
      toast.error("Error connecting to server");
    } finally {
      setDetailLoading(false);
    }
  };

  // Same blob/object-URL/anchor-click download pattern as handleDownload in
  // reports/page.tsx, just pointed at the invoice PDF endpoint.
  const handleDownload = async (invoice: InvoiceSummaryDto) => {
    setDownloadingId(invoice.id);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/invoices/${invoice.id}/download`);
      if (!res.ok) {
        toast.error("Failed to download invoice");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    } catch (err) {
      console.error("Error downloading invoice", err);
      toast.error("Error connecting to server");
    } finally {
      setDownloadingId(null);
    }
  };

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-2">
        <span className="text-sm font-bold text-zinc-600">You don&apos;t have access to Invoices.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-zinc-200">
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
          <Receipt className="h-6 w-6 text-zinc-500" />
          Invoices
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Preview and generate invoices for your billable survey activity, and track their review status.
        </p>
      </div>

      <Card className="border-zinc-200 shadow-sm bg-white dark:bg-zinc-900">
        <CardHeader className="py-3 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Generate Invoice</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-zinc-500">Month</label>
              <Select
                items={[{ value: "all", label: "Custom range" }, ...monthOptions]}
                value={filterMonth || "all"}
                onValueChange={(v) => applyMonth(v ?? "all")}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Quick month">
                  <SelectValue placeholder="Custom range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Custom range</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-zinc-500">From</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => handleFromDateChange(e.target.value)}
                className="h-8 w-[150px] text-xs"
                aria-label="From date"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-zinc-500">To</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => handleToDateChange(e.target.value)}
                className="h-8 w-[150px] text-xs"
                aria-label="To date"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-zinc-500">Project</label>
              <Select
                items={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: p.id, label: p.projectName }))]}
                value={projectFilter}
                onValueChange={(v) => handleProjectChange(v)}
              >
                <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Project scope">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.projectName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!fromDate || !toDate || previewLoading}
                onClick={handlePreview}
              >
                {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                <span className="ml-1.5">Preview</span>
              </Button>
              {canCreate && (
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!fromDate || !toDate || generating}
                  onClick={handleGenerate}
                >
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <Receipt size={13} />}
                  <span className="ml-1.5">Generate Invoice</span>
                </Button>
              )}
            </div>
          </div>

          {previewLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}

          {!previewLoading && preview && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950/30 text-xs font-semibold text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                Preview only — nothing has been saved yet.
              </div>
              {preview.lineItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-400">
                  No billable Complete/Reconcile activity found for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Project</TableHead>
                        <TableHead className="text-xs text-right">Vendor CPI</TableHead>
                        <TableHead className="text-xs text-right">Completes</TableHead>
                        <TableHead className="text-xs text-right">Reconciled</TableHead>
                        <TableHead className="text-xs text-right">Billable</TableHead>
                        <TableHead className="text-xs text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.lineItems.map((li) => (
                        <TableRow key={li.projectId}>
                          <TableCell className="text-xs">{li.projectName}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{li.vendorCpi.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{li.completeCount}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{li.reconcileCount}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{li.billableCount}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatMoney(li.lineTotal, preview.currencyName)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
                <span className="text-xs text-zinc-500">{preview.totalBillableCount} billable responses</span>
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{formatMoney(preview.totalAmount, preview.currencyName)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 shadow-sm bg-white dark:bg-zinc-900">
        <CardHeader className="py-3 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Your Invoices</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loadingInvoices ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-sm text-zinc-400">No invoices generated yet.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Invoice #</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                    <TableHead className="text-xs">Scope</TableHead>
                    <TableHead className="text-xs text-right">Billable</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs">Generated</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs font-mono font-semibold">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{inv.fromDate} to {inv.toDate}</TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate" title={scopeLabel(inv.projectName)}>
                        {scopeLabel(inv.projectName)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{inv.totalBillableCount}</TableCell>
                      <TableCell className="text-xs text-right font-mono whitespace-nowrap">{formatMoney(inv.totalAmount, inv.currencyName)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeClass(inv.status)}`}>
                          {inv.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{new Date(inv.generatedAt).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openDetail(inv.id)}>
                            <Eye size={12} />
                            <span className="ml-1">View</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={downloadingId === inv.id}
                            onClick={() => handleDownload(inv)}
                          >
                            {downloadingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                            <span className="ml-1">PDF</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detailInvoice ? detailInvoice.summary.invoiceNumber : "Invoice"}</DialogTitle>
            <DialogDescription>
              {detailInvoice
                ? `${detailInvoice.summary.vendorName} — ${detailInvoice.summary.fromDate} to ${detailInvoice.summary.toDate}`
                : "Loading invoice detail..."}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : detailInvoice ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-zinc-400">Scope: </span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{scopeLabel(detailInvoice.summary.projectName)}</span>
                </div>
                <div>
                  <span className="text-zinc-400">Status: </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeClass(detailInvoice.summary.status)}`}>
                    {detailInvoice.summary.status}
                  </span>
                </div>
                {detailInvoice.summary.status === "REJECTED" && detailInvoice.summary.rejectionReason && (
                  <div className="col-span-2">
                    <span className="text-zinc-400">Rejection reason: </span>
                    <span className="text-red-600 dark:text-red-400">{detailInvoice.summary.rejectionReason}</span>
                  </div>
                )}
                {detailInvoice.summary.status === "PAID" && detailInvoice.summary.paidAt && (
                  <div>
                    <span className="text-zinc-400">Paid on: </span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {new Date(detailInvoice.summary.paidAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {detailInvoice.summary.reviewedByName && (
                  <div>
                    <span className="text-zinc-400">Reviewed by: </span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{detailInvoice.summary.reviewedByName}</span>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Project</TableHead>
                      <TableHead className="text-xs text-right">Vendor CPI</TableHead>
                      <TableHead className="text-xs text-right">Completes</TableHead>
                      <TableHead className="text-xs text-right">Reconciled</TableHead>
                      <TableHead className="text-xs text-right">Billable</TableHead>
                      <TableHead className="text-xs text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailInvoice.lineItems.map((li) => (
                      <TableRow key={li.projectId}>
                        <TableCell className="text-xs">{li.projectName}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{li.vendorCpi.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{li.completeCount}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{li.reconcileCount}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{li.billableCount}</TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {formatMoney(li.lineTotal, detailInvoice.summary.currencyName)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-xs text-zinc-500">{detailInvoice.summary.totalBillableCount} billable responses</span>
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  {formatMoney(detailInvoice.summary.totalAmount, detailInvoice.summary.currencyName)}
                </span>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={downloadingId === detailInvoice.summary.id}
                  onClick={() => handleDownload(detailInvoice.summary)}
                >
                  {downloadingId === detailInvoice.summary.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  <span className="ml-1.5">Download PDF</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-zinc-400">Failed to load invoice.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
