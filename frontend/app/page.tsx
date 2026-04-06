"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Severity = "NORMAL" | "WARNING" | "CRITICAL";
type CustomerProfile = "retail" | "industrial" | "enterprise";
type Priority = "URGENT" | "REVIEW" | "STABLE";
type Trend = "up" | "down" | "flat";
type LeakRisk = "LOW" | "MEDIUM" | "HIGH";

type ClientSummary = {
  client_id: number;
  name: string;
  address: string;
  device_type: string;
  system_type: string;
  status: Severity;
  priority: Priority;
  health_score: number;
  trend: Trend;
  leak_risk: LeakRisk;
  alert_count: number;
  runtime: number;
  last_update: string;
  ai_insight: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const COMPANY_ID = process.env.NEXT_PUBLIC_COMPANY_ID ?? "ghost-hvac-co";
const POLL_INTERVAL_MS = 3000;

function resolveApiBaseUrl(): string {
  if (API_BASE_URL) {
    if (!API_BASE_URL.startsWith("http://") && !API_BASE_URL.startsWith("https://")) {
      return `https://${API_BASE_URL}`;
    }
    return API_BASE_URL;
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:8000";
  }

  return "";
}

function formatUpdatedTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile>("retail");
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Severity>("ALL");
  const [riskFilter, setRiskFilter] = useState<"ALL" | LeakRisk>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | string>("ALL");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const baseUrl = resolveApiBaseUrl();
      if (!baseUrl) {
        throw new Error("Missing NEXT_PUBLIC_API_URL. Configure your backend URL.");
      }

      const response = await fetch(
        `${baseUrl}/clients?company_id=${COMPANY_ID}&profile=${profile}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(`Clients request failed with ${response.status}`);
      }

      const payload = (await response.json()) as ClientSummary[];
      setClients(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown client loading error.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadClients();
    const timerId = window.setInterval(() => {
      void loadClients();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [loadClients]);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setActionMessage(null);
    }, 2400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [actionMessage]);

  const filteredClients = useMemo(() => {
    const priorityRank: Record<Priority, number> = {
      URGENT: 0,
      REVIEW: 1,
      STABLE: 2,
    };

    return clients
      .filter((client) => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) {
          return true;
        }
        return (
          client.name.toLowerCase().includes(q) ||
          client.address.toLowerCase().includes(q)
        );
      })
      .filter((client) => statusFilter === "ALL" || client.status === statusFilter)
      .filter((client) => riskFilter === "ALL" || client.leak_risk === riskFilter)
      .filter((client) => typeFilter === "ALL" || client.system_type === typeFilter)
      .sort(
        (a, b) =>
          priorityRank[a.priority] - priorityRank[b.priority] ||
          a.health_score - b.health_score
      );
  }, [clients, riskFilter, searchTerm, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    const summary = {
      total: filteredClients.length,
      normal: 0,
      warning: 0,
      critical: 0,
      avgHealth: 0,
      activeSystems: 0,
      systemsRunning: 0,
    };

    if (filteredClients.length === 0) {
      return summary;
    }

    let totalHealth = 0;
    for (const client of filteredClients) {
      totalHealth += client.health_score;
      if (client.status === "NORMAL") {
        summary.normal += 1;
      } else if (client.status === "WARNING") {
        summary.warning += 1;
      } else {
        summary.critical += 1;
      }
      if (client.status !== "NORMAL" || client.alert_count > 0) {
        summary.activeSystems += 1;
      }
      if (client.runtime >= 9.5) {
        summary.systemsRunning += 1;
      }
    }

    summary.avgHealth = Math.round(totalHealth / filteredClients.length);
    return summary;
  }, [filteredClients]);

  const statusStyle = (status: Severity): string => {
    if (status === "CRITICAL") {
      return "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/50";
    }
    if (status === "WARNING") {
      return "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40";
    }
    return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";
  };

  const priorityStyle = (priority: Priority): string => {
    if (priority === "URGENT") {
      return "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/50";
    }
    if (priority === "REVIEW") {
      return "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40";
    }
    return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";
  };

  const trendDisplay = (trend: Trend): string => {
    if (trend === "down") {
      return "⬇ Dropping";
    }
    if (trend === "up") {
      return "⬆ Improving";
    }
    return "→ Stable";
  };

  const systemTypes = useMemo(() => {
    const types = Array.from(new Set(clients.map((c) => c.system_type)));
    return types.sort();
  }, [clients]);

  const onQuickAction = useCallback((label: string, clientName: string) => {
    setActionMessage(`${label} queued for ${clientName}`);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-12 pt-10 sm:px-8 lg:px-12">
      <div className="ghost-orb ghost-orb-left" aria-hidden="true" />
      <div className="ghost-orb ghost-orb-right" aria-hidden="true" />

      {actionMessage ? (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-cyan-500/40 bg-slate-900/95 px-4 py-3 text-sm text-cyan-200 shadow-[0_0_20px_-8px_rgba(6,182,212,0.8)]">
          {actionMessage}
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl animate-fadeIn space-y-6">
        <header className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-6 shadow-[0_0_80px_-25px_rgba(6,182,212,0.4)] backdrop-blur">
          <h1 className="font-heading text-3xl tracking-[0.08em] text-cyan-300 sm:text-4xl">
            Fleet Monitoring Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-300 sm:text-base">
            Monitor all clients in one place and drill into any location instantly.
          </p>

          <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-4 lg:grid-cols-8">
            <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1">
              Company: {COMPANY_ID}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1">
              Total: {counts.total}
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
              Normal: {counts.normal}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-300">
              Warning: {counts.warning}
            </span>
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-300">
              Critical: {counts.critical}
            </span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300">
              Avg Health: {counts.avgHealth}%
            </span>
            <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1">
              Active Systems: {counts.activeSystems}
            </span>
            <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1">
              Systems Running: {counts.systemsRunning}
            </span>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur">
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Search
              </label>
              <input
                type="search"
                placeholder="Search by client name or address"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "ALL" | Severity)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="ALL">All</option>
                <option value="CRITICAL">Critical</option>
                <option value="WARNING">Warning</option>
                <option value="NORMAL">Normal</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Leak Risk
              </label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as "ALL" | LeakRisk)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="ALL">All</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="ALL">All</option>
                {systemTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl tracking-wide text-slate-100">Client Portfolio</h2>
            <div className="w-full max-w-xs">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Profile Preset
              </label>
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value as CustomerProfile)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="retail">Retail HVAC</option>
                <option value="industrial">Industrial HVAC</option>
                <option value="enterprise">Multi-site Enterprise</option>
              </select>
            </div>
          </div>

          {errorMessage ? (
            <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              Error: {errorMessage}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Health</th>
                  <th className="px-3 py-3">Trend</th>
                  <th className="px-3 py-3">Leak Risk</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Alerts</th>
                  <th className="px-3 py-3">AI Insight</th>
                  <th className="px-3 py-3">Last Update</th>
                  <th className="px-3 py-3">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300">
                {filteredClients.map((client) => (
                  <tr
                    key={client.client_id}
                    className="cursor-pointer hover:bg-slate-900/50"
                    onClick={() => router.push(`/client/${client.client_id}`)}
                  >
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-100">{client.name}</p>
                      <p className="text-xs text-slate-500">{client.address}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityStyle(client.priority)}`}>
                        {client.priority}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(client.status)}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-cyan-300">
                      {client.health_score}%
                    </td>
                    <td className="px-3 py-3 text-slate-200">{trendDisplay(client.trend)}</td>
                    <td className="px-3 py-3">{client.leak_risk}</td>
                    <td className="px-3 py-3">{client.system_type}</td>
                    <td className="px-3 py-3 text-amber-300">🔔 {client.alert_count}</td>
                    <td className="max-w-[250px] truncate px-3 py-3 text-slate-300">
                      {client.ai_insight}
                    </td>
                    <td className="px-3 py-3 text-slate-400">
                      <p>Live</p>
                      <p className="text-xs">Updated: {formatUpdatedTime(client.last_update)}</p>
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
                          onClick={() => router.push(`/client/${client.client_id}`)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                          onClick={() => onQuickAction("Notify Tech", client.name)}
                        >
                          Notify Tech
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-300 hover:bg-violet-500/20"
                          onClick={() => onQuickAction("Generate Report", client.name)}
                        >
                          Generate Report
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredClients.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                      No clients match the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            {loading ? "Refreshing client telemetry..." : `Polling every ${POLL_INTERVAL_MS / 1000}s`}
          </p>
        </section>
      </div>
    </main>
  );
}
