"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type HistoryPoint = {
  time: string;
  pressure: number;
  runtime: number;
  superheat: number;
};

type ChartProps = {
  data: HistoryPoint[];
};

export default function Chart({ data }: ChartProps) {
  return (
    <section className="rounded-2xl border border-cyan-500/25 bg-slate-950/65 p-6 backdrop-blur">
      <h2 className="font-heading mb-4 text-xl tracking-wide text-slate-100">
        Runtime Telemetry
      </h2>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#020617",
                border: "1px solid #334155",
                borderRadius: "12px",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="pressure"
              stroke="#22d3ee"
              strokeWidth={2.4}
              dot={false}
              name="Pressure"
            />
            <Line
              type="monotone"
              dataKey="runtime"
              stroke="#f59e0b"
              strokeWidth={2.4}
              dot={false}
              name="Runtime"
            />
            <Line
              type="monotone"
              dataKey="superheat"
              stroke="#a78bfa"
              strokeWidth={2.4}
              dot={false}
              name="Superheat °F"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
