"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardStatsCards from "@/components/dashboard-stats-cards";
import MonthlyStatsSection from "@/components/monthly-stats-section";
import SurveyDetailsModal from "@/components/survey-details-modal";
import StatusBreakdownChart from "@/components/status-breakdown-chart";
import SurveyTrendChart from "@/components/survey-trend-chart";
import ReportExportButtons from "@/components/report-export-buttons";
import { API_BASE_URL, apiFetch } from "@/lib/api";

// Shape of a row in `surveyInformations` from /api/vendor/dashboard/today -
// deliberately has no client_cpi/vendor_cpi/profit fields at all (see
// VendorDashboardRepository on the backend) - this is a different, narrower
// shape than the admin dashboard's equivalent, not just the same type with
// fields ignored.
interface SurveyInformationItem {
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
  status: number | null;
}

interface DailyStatusCount {
  day: string;
  status: number | null;
  cnt: number | string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  const [surveyInformations, setSurveyInformations] = useState<SurveyInformationItem[]>([]);
  const [dailyStatusCounts, setDailyStatusCounts] = useState<DailyStatusCount[]>([]);

  const [surveyModalOpen, setSurveyModalOpen] = useState(false);
  const [surveyModalTitle, setSurveyModalTitle] = useState("");
  const [surveyModalData, setSurveyModalData] = useState<SurveyInformationItem[]>([]);

  const [complets, setComplets] = useState<SurveyInformationItem[]>([]);
  const [disqualifies, setDisqualifies] = useState<SurveyInformationItem[]>([]);
  const [quotaFulls, setQuotaFulls] = useState<SurveyInformationItem[]>([]);
  const [securityTerms, setSecurityTerms] = useState<SurveyInformationItem[]>([]);
  const [drops, setDrops] = useState<SurveyInformationItem[]>([]);

  const [completsMonthlyCount, setCompletsMonthlyCount] = useState(0);
  const [disqualifiesMonthlyCount, setDisqualifiesMonthlyCount] = useState(0);
  const [quotaFullsMonthlyCount, setQuotaFullsMonthlyCount] = useState(0);
  const [securityTermsMonthlyCount, setSecurityTermsMonthlyCount] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState(0);

  const calculateDailyStastics = useCallback((data: SurveyInformationItem[]) => {
    const c: SurveyInformationItem[] = [];
    const dq: SurveyInformationItem[] = [];
    const qf: SurveyInformationItem[] = [];
    const st: SurveyInformationItem[] = [];
    const dr: SurveyInformationItem[] = [];

    data.forEach((item) => {
      if (item.status === 0 || item.status === null) dr.push(item);
      else if (item.status === 1) c.push(item);
      else if (item.status === 2) dq.push(item);
      else if (item.status === 3) qf.push(item);
      else if (item.status === 4) st.push(item);
    });

    setComplets(c);
    setDisqualifies(dq);
    setQuotaFulls(qf);
    setSecurityTerms(st);
    setDrops(dr);
  }, []);

  const calculateMonthlyStatistics = useCallback((data: DailyStatusCount[]) => {
    let cCount = 0;
    let dqCount = 0;
    let qfCount = 0;
    let stCount = 0;
    let total = 0;

    data.forEach((item) => {
      const cnt = typeof item.cnt === "number" ? item.cnt : parseInt(item.cnt, 10) || 0;
      total += cnt;
      if (item.status === 1) cCount += cnt;
      else if (item.status === 2) dqCount += cnt;
      else if (item.status === 3) qfCount += cnt;
      else if (item.status === 4) stCount += cnt;
    });

    setCompletsMonthlyCount(cCount);
    setDisqualifiesMonthlyCount(dqCount);
    setQuotaFullsMonthlyCount(qfCount);
    setSecurityTermsMonthlyCount(stCount);
    setMonthlyTotal(total);
  }, []);

  const fetchDashboardInit = useCallback(async (showLoader = false, trackActivity = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/dashboard/today`, { trackActivity });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.surveyInformations) {
          setSurveyInformations(data.surveyInformations);
          calculateDailyStastics(data.surveyInformations);
        }
      }
    } catch (err) {
      console.error("Error fetching dashboard survey informations", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [calculateDailyStastics]);

  const fetchMonthlyStastics = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/vendor/dashboard/monthly-statistics`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.dailyStatusCounts) {
          setDailyStatusCounts(data.dailyStatusCounts);
          calculateMonthlyStatistics(data.dailyStatusCounts);
        }
      }
    } catch (err) {
      console.error("Error fetching monthly statistics", err);
    }
  }, [calculateMonthlyStatistics]);

  const handleShowDailyFullDetails = (type: number) => {
    if (type === 1) {
      setSurveyModalTitle("Complete");
      setSurveyModalData(complets);
    } else if (type === 2) {
      setSurveyModalTitle("Disqualify");
      setSurveyModalData(disqualifies);
    } else if (type === 3) {
      setSurveyModalTitle("Quota Full");
      setSurveyModalData(quotaFulls);
    } else if (type === 4) {
      setSurveyModalTitle("Security Term");
      setSurveyModalData(securityTerms);
    } else if (type === 0) {
      setSurveyModalTitle("Drop");
      setSurveyModalData(drops);
    }
    setSurveyModalOpen(true);
  };

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      await Promise.all([fetchDashboardInit(), fetchMonthlyStastics()]);
      setLoading(false);
    };

    loadAllData();

    // 60 second interval auto-refresh for today's stats only, matching the
    // internal dashboard's own convention - trackActivity=false since this is
    // a background poll, not something the user did.
    const interval = setInterval(() => {
      fetchDashboardInit(false, false);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchDashboardInit, fetchMonthlyStastics]);

  const triggerManualRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchDashboardInit(), fetchMonthlyStastics()]);
    setLoading(false);
  };

  if (loading && surveyInformations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-zinc-600" />
        <span className="text-sm font-medium text-zinc-500">Loading Dashboard Statistics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Monitor your survey activity and completions in real time.
          </p>
        </div>
        <Button
          onClick={triggerManualRefresh}
          disabled={loading}
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 border-zinc-200 text-zinc-600 dark:text-zinc-300 shadow-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
          Today&apos;s Survey Statistics
        </h2>
        <DashboardStatsCards
          completsCount={complets.length}
          disqualifiesCount={disqualifies.length}
          quotaFullsCount={quotaFulls.length}
          securityTermsCount={securityTerms.length}
          dropsCount={drops.length}
          onCardClick={handleShowDailyFullDetails}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        <StatusBreakdownChart
          completed={complets.length}
          disqualify={disqualifies.length}
          quotaFull={quotaFulls.length}
          securityTerm={securityTerms.length}
          drop={drops.length}
        />
        <SurveyTrendChart data={dailyStatusCounts} />
      </section>

      <section className="pt-2">
        <MonthlyStatsSection
          completsMonthlyCount={completsMonthlyCount}
          disqualifiesMonthlyCount={disqualifiesMonthlyCount}
          quotaFullsMonthlyCount={quotaFullsMonthlyCount}
          securityTermMonthlyCount={securityTermsMonthlyCount}
          totalMonthlyCount={monthlyTotal}
        />
      </section>

      <section className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
            Download Report
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">This month&apos;s survey activity, in your preferred format.</p>
        </div>
        <ReportExportButtons />
      </section>

      <SurveyDetailsModal
        isOpen={surveyModalOpen}
        onClose={() => setSurveyModalOpen(false)}
        title={surveyModalTitle}
        data={surveyModalData}
      />
    </div>
  );
}
