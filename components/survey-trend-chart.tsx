"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";

// Raw {day, status, cnt} triples from /api/vendor/dashboard/monthly-statistics -
// grouped here into one row per day (one bar), stacked by status, matching the
// same status codes used throughout (0=Drop,1=Complete,2=Disqualify,3=QuotaFull,4=SecurityTerm).
interface DailyStatusCount {
  day: string;
  status: number | null;
  cnt: number | string;
}

interface ChartDay {
  day: string;
  complete: number;
  disqualify: number;
  quotaFull: number;
  securityTerm: number;
  drop: number;
}

const STATUS_KEYS: Record<number, keyof Omit<ChartDay, "day">> = {
  0: "drop",
  1: "complete",
  2: "disqualify",
  3: "quotaFull",
  4: "securityTerm"
};

const SERIES: { key: keyof Omit<ChartDay, "day">; label: string; color: string }[] = [
  { key: "complete", label: "Completed", color: "#0891b2" },
  { key: "disqualify", label: "Disqualify", color: "#dc2626" },
  { key: "quotaFull", label: "Quota Full", color: "#d97706" },
  { key: "securityTerm", label: "Security Term", color: "#475569" },
  { key: "drop", label: "Drop", color: "#059669" }
];

function buildChartData(rows: DailyStatusCount[]): ChartDay[] {
  const byDay = new Map<string, ChartDay>();
  for (const row of rows) {
    const statusKey = STATUS_KEYS[row.status ?? 0];
    if (!statusKey) continue;
    let entry = byDay.get(row.day);
    if (!entry) {
      entry = { day: row.day, complete: 0, disqualify: 0, quotaFull: 0, securityTerm: 0, drop: 0 };
      byDay.set(row.day, entry);
    }
    entry[statusKey] += typeof row.cnt === "number" ? row.cnt : parseInt(row.cnt, 10) || 0;
  }
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

export default function SurveyTrendChart({ data }: { data: DailyStatusCount[] }) {
  const chartData = buildChartData(data);

  return (
    <Card className="border border-zinc-200 shadow-sm bg-white dark:bg-zinc-900">
      <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
        <CardTitle className="text-lg font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide">
          Monthly Trend
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
            No survey activity yet this month.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="status" fill={s.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
