"use client";

import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";

interface StatusBreakdownChartProps {
  completed: number;
  disqualify: number;
  quotaFull: number;
  securityTerm: number;
  drop: number;
}

const COLORS: Record<string, string> = {
  Completed: "#0891b2",
  Disqualify: "#dc2626",
  "Quota Full": "#d97706",
  "Security Term": "#475569",
  Drop: "#059669"
};

export default function StatusBreakdownChart({
  completed,
  disqualify,
  quotaFull,
  securityTerm,
  drop
}: StatusBreakdownChartProps) {
  const data = [
    { name: "Completed", value: completed },
    { name: "Disqualify", value: disqualify },
    { name: "Quota Full", value: quotaFull },
    { name: "Security Term", value: securityTerm },
    { name: "Drop", value: drop }
  ].filter((d) => d.value > 0);

  return (
    <Card className="border border-zinc-200 shadow-sm bg-white dark:bg-zinc-900">
      <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
        <CardTitle className="text-lg font-bold text-zinc-800 dark:text-zinc-100 uppercase tracking-wide">
          Today&apos;s Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
            No survey activity yet today.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[entry.name]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
