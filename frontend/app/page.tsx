"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Severity = "NORMAL" | "WARNING" | "CRITICAL";
type CustomerProfile = "retail" | "industrial" | "enterprise";

type ClientSummary = {
  client_id: number;
  name: string;
  address: string;
  device_type: string;
  status: Severity;
  health_score: number;
  leak_risk: "LOW" | "MEDIUM" | "HIGH";
  last_update: string;
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

function formatTimeAgo(timestamp: string): string {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function Home() {
  const [profile, setProfile] = useState<CustomerProfile>("retail");
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const counts = useMemo(() => {
    const summary = {
      total: clients.length,
      normal: 0,
      warning: 0,
      critical: 0,
    };
    for (const client of clients) {
      if (client.status === "NORMAL") {
        summary.normal += 1;
      } else if (client.status === "WARNING") {
        summary.warning += 1;
      } else {
        summary.critical += 1;
      }
    }
    return summary;
  }, [clients]);

  const statusStyle = (status: Severity): string => {
    if (status === "CRITICAL") {
      return "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/50";
    }
    if (status === "WARNING") {
      return "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40";
    }
    return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-12 pt-10 sm:px-8 lg:px-12">
      <div className="ghost-orb ghost-orb-left" aria-hidden="true" />
      <div className="ghost-orb ghost-orb-right" aria-hidden="true" />

      <div className="mx-auto max-w-7xl animate-fadeIn space-y-6">
        <header className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-6 shadow-[0_0_80px_-25px_rgba(6,182,212,0.4)] backdrop-blur">
          <h1 className="font-heading text-3xl tracking-[0.08em] text-cyan-300 sm:text-4xl">
            Fleet Monitoring Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-300 sm:text-base">
            Monitor all clients in one place and drill into any location instantly.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
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
          </div>
        </header>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur">
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
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Health</th>
                  <th className="px-3 py-3">Leak Risk</th>
                  <th className="px-3 py-3">Last Update</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300">
                {clients.map((client) => (
                  <tr key={client.client_id} className="hover:bg-slate-900/50">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-100">{client.name}</p>
                      <p className="text-xs text-slate-500">{client.address}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(client.status)}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-cyan-300">
                      {client.health_score}%
                    </td>
                    <td className="px-3 py-3">{client.leak_risk}</td>
                    <td className="px-3 py-3 text-slate-400">{formatTimeAgo(client.last_update)}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/client/${client.client_id}`}
                        className="inline-flex rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      No clients found for this company.
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
