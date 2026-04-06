"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import type { HistoryPoint } from "@/components/Chart";
import StatusCard from "@/components/StatusCard";

const Chart = dynamic(() => import("@/components/Chart"), {
  ssr: false,
});

type Severity = "NORMAL" | "WARNING" | "CRITICAL";

type SimulationResponse = {
  data: {
    timestamp: string;
    pressure: number;
    runtime: number;
  };
  analysis: {
    alerts: string[];
    severity: Severity;
  };
};

type AlertLogItem = {
  time: string;
  message: string;
};

type ResetResponse = {
  message: string;
  previous_pressure: number;
};

type SubscribeResponse = {
  message: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const POLL_INTERVAL_MS = 2500;
const MAX_HISTORY_POINTS = 30;
const MAX_ALERT_LOG = 8;

function formatDisplayTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

function resolveApiBaseUrl(): string {
  if (API_BASE_URL) {
    // Ensure an absolute URL — add https:// if the value has no scheme
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

export default function Home() {
  const [leakMode, setLeakMode] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [severity, setSeverity] = useState<Severity>("NORMAL");
  const [currentAlerts, setCurrentAlerts] = useState<string[]>([]);
  const [alertLog, setAlertLog] = useState<AlertLogItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alertPhone, setAlertPhone] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const fetchSimulation = useCallback(async (leak: boolean) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const baseUrl = resolveApiBaseUrl();
      if (!baseUrl) {
        throw new Error(
          "Missing NEXT_PUBLIC_API_URL. Set it to your backend public URL in Vercel environment variables."
        );
      }

      const response = await fetch(`${baseUrl}/simulate?leak=${leak}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Backend request failed with ${response.status}`);
      }

      const payload = (await response.json()) as SimulationResponse;
      const displayTime = formatDisplayTime(payload.data.timestamp);

      setHistory((previous) => {
        const next: HistoryPoint[] = [
          ...previous,
          {
            time: displayTime,
            pressure: payload.data.pressure,
            runtime: payload.data.runtime,
          },
        ];
        return next.slice(-MAX_HISTORY_POINTS);
      });

      setSeverity(payload.analysis.severity);
      setCurrentAlerts(payload.analysis.alerts);
      setLastUpdated(displayTime);

      if (payload.analysis.alerts.length > 0) {
        setAlertLog((previous) => {
          const nextEntries = payload.analysis.alerts.map((message) => ({
            time: displayTime,
            message,
          }));
          return [...nextEntries, ...previous].slice(0, MAX_ALERT_LOG);
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown API error occurred.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSimulation(leakMode);

    const timerId = window.setInterval(() => {
      fetchSimulation(leakMode);
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [fetchSimulation, leakMode]);

  const handleLeak = useCallback(() => {
    setLeakMode(true);
    fetchSimulation(true);
  }, [fetchSimulation]);

  const handleReset = useCallback(() => {
    const resetSimulation = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const baseUrl = resolveApiBaseUrl();
        if (!baseUrl) {
          throw new Error(
            "Missing NEXT_PUBLIC_API_URL. Set it to your backend public URL in Vercel environment variables."
          );
        }

        const response = await fetch(`${baseUrl}/reset`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Reset request failed with ${response.status}`);
        }

        await response.json() as ResetResponse;

        setLeakMode(false);
        setHistory([]);
        setCurrentAlerts([]);
        setAlertLog([]);
        setSeverity("NORMAL");
        setLastUpdated(null);
        await fetchSimulation(false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown reset error occurred.";
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
      }
    };

    void resetSimulation();
  }, [fetchSimulation]);

  const handleSubscribe = useCallback(async () => {
    if (!alertPhone && !alertEmail) return;
    setIsSubscribing(true);
    setSubscribeStatus(null);
    try {
      const baseUrl = resolveApiBaseUrl();
      if (!baseUrl) throw new Error("API URL not configured.");
      const res = await fetch(`${baseUrl}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: alertPhone, email: alertEmail }),
      });
      const json = (await res.json()) as SubscribeResponse;
      setSubscribeStatus(json.message);
      setAlertPhone("");
      setAlertEmail("");
    } catch {
      setSubscribeStatus("Subscription failed. Please try again.");
    } finally {
      setIsSubscribing(false);
    }
  }, [alertPhone, alertEmail]);

  const modeTag = useMemo(
    () => (leakMode ? "Leak simulation enabled" : "Monitoring nominal conditions"),
    [leakMode]
  );

  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-12 pt-10 sm:px-8 lg:px-12">
      <div className="ghost-orb ghost-orb-left" aria-hidden="true" />
      <div className="ghost-orb ghost-orb-right" aria-hidden="true" />

      <div className="mx-auto max-w-6xl animate-fadeIn space-y-6">
        <header className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-6 shadow-[0_0_80px_-25px_rgba(6,182,212,0.4)] backdrop-blur">
          <h1 className="font-heading text-3xl tracking-[0.08em] text-cyan-300 sm:text-4xl">
            ❄️ Know your HVAC is failing before it actually does.
          </h1>
          <p className="mt-2 text-sm text-slate-300 sm:text-base">
            AI-powered monitoring that detects refrigerant leaks, inefficiencies, and system failures in real time.
          </p>
          <p className="mt-3 text-sm font-semibold text-cyan-400">
            You&apos;ll get a text before your system fails.
          </p>
          <div className="mt-4 inline-flex rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-400">
            {modeTag}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <StatusCard
            severity={severity}
            alerts={currentAlerts}
            lastUpdated={lastUpdated}
          />
          <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur">
            <h2 className="font-heading text-xl tracking-wide text-slate-100">
              Controls
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Polling every 2.5 seconds. Trigger leak mode to stress the system.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-xl border border-rose-400/45 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/30"
                onClick={handleLeak}
              >
                Simulate Leak
              </button>
              <button
                type="button"
                className="rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
                onClick={handleReset}
              >
                Reset
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
              {isLoading ? "Fetching telemetry..." : "Realtime feed active"}
              {errorMessage ? (
                <p className="mt-2 text-rose-300">Error: {errorMessage}</p>
              ) : null}
            </div>
          </section>
        </div>

        <Chart data={history} />

        <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-6 shadow-[0_0_60px_-20px_rgba(6,182,212,0.25)] backdrop-blur">
          <h2 className="font-heading text-xl tracking-wide text-cyan-300">
            Get Alerts
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Enter your phone or email and we&apos;ll blast you an alert the moment we detect a problem.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="tel"
              placeholder="Phone number (e.g. +15550001234)"
              value={alertPhone}
              onChange={(e) => setAlertPhone(e.target.value)}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
            />
            <input
              type="email"
              placeholder="Email address"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              disabled={isSubscribing || (!alertPhone && !alertEmail)}
              onClick={() => void handleSubscribe()}
              className="rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-5 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-50"
            >
              {isSubscribing ? "Subscribing…" : "Notify Me"}
            </button>
          </div>
          {subscribeStatus ? (
            <p className="mt-3 text-sm text-cyan-300">{subscribeStatus}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur">
          <h2 className="font-heading text-xl tracking-wide text-slate-100">
            Recent Alert Log
          </h2>
          {alertLog.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No alerts captured yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {alertLog.map((entry, index) => (
                <li
                  key={`${entry.time}-${entry.message}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"
                >
                  <span className="mr-2 text-cyan-300">[{entry.time}]</span>
                  {entry.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
