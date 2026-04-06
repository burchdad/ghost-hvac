"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { HistoryPoint } from "@/components/Chart";
import StatusCard from "@/components/StatusCard";

const Chart = dynamic(() => import("@/components/Chart"), {
  ssr: false,
});

type Severity = "NORMAL" | "WARNING" | "CRITICAL";
type CustomerProfile = "retail" | "industrial" | "enterprise";

type SimulationResponse = {
  data: {
    timestamp: string;
    pressure: number;
    runtime: number;
    superheat: number;
    subcooling: number;
    delta_t: number;
    ambient_temp: number;
  };
  analysis: {
    alerts: string[];
    severity: Severity;
    health_score: number;
    leak_probability: number;
    leak_label: "LOW" | "MEDIUM" | "HIGH";
    efficiency_score: number;
    cost_impact_low: number;
    cost_impact_high: number;
    failure_window: string;
    customer_profile: CustomerProfile;
    ai_diagnosis: string;
    ai_explanation: string;
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
  const [healthScore, setHealthScore] = useState<number>(100);
  const [displayHealthScore, setDisplayHealthScore] = useState<number>(100);
  const [leakProbability, setLeakProbability] = useState<number>(0);
  const [leakLabel, setLeakLabel] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW");
  const [efficiencyScore, setEfficiencyScore] = useState<number>(100);
  const [costImpactLow, setCostImpactLow] = useState<number>(0);
  const [costImpactHigh, setCostImpactHigh] = useState<number>(0);
  const [failureWindow, setFailureWindow] = useState<string>("30+ days");
  const [aiDiagnosis, setAiDiagnosis] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [leakEventTime, setLeakEventTime] = useState<string | null>(null);
  const [latestData, setLatestData] = useState<{ pressure: number; runtime: number; superheat: number; subcooling: number; delta_t: number; ambient_temp: number } | null>(null);
  const [alertPhone, setAlertPhone] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>("retail");
  const previousSeverity = useRef<Severity>("NORMAL");

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

      const response = await fetch(
        `${baseUrl}/simulate?leak=${leak}&profile=${customerProfile}`,
        {
        cache: "no-store",
        }
      );

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
            superheat: payload.data.superheat,
          },
        ];
        return next.slice(-MAX_HISTORY_POINTS);
      });

      setSeverity(payload.analysis.severity);
      setCurrentAlerts(payload.analysis.alerts);
      setLastUpdated(displayTime);
      setHealthScore(payload.analysis.health_score);
      setLeakProbability(payload.analysis.leak_probability);
      setLeakLabel(payload.analysis.leak_label);
      setEfficiencyScore(payload.analysis.efficiency_score);
      setCostImpactLow(payload.analysis.cost_impact_low);
      setCostImpactHigh(payload.analysis.cost_impact_high);
      setFailureWindow(payload.analysis.failure_window);
      setCustomerProfile(payload.analysis.customer_profile);
      setAiDiagnosis(payload.analysis.ai_diagnosis || payload.analysis.ai_explanation);
      if (!leakEventTime && payload.analysis.severity !== "NORMAL") {
        setLeakEventTime(displayTime);
      }
      setLatestData({
        pressure: payload.data.pressure,
        runtime: payload.data.runtime,
        superheat: payload.data.superheat,
        subcooling: payload.data.subcooling,
        delta_t: payload.data.delta_t,
        ambient_temp: payload.data.ambient_temp,
      });

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
  }, [customerProfile, leakEventTime]);

  useEffect(() => {
    fetchSimulation(leakMode);

    const timerId = window.setInterval(() => {
      fetchSimulation(leakMode);
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [fetchSimulation, leakMode]);

  useEffect(() => {
    if (displayHealthScore === healthScore) {
      return;
    }

    const delta = healthScore - displayHealthScore;
    const step = Math.abs(delta) > 10 ? Math.sign(delta) * 4 : Math.sign(delta) * 1;
    const timer = window.setTimeout(() => {
      setDisplayHealthScore((prev) => {
        const next = prev + step;
        if ((step > 0 && next > healthScore) || (step < 0 && next < healthScore)) {
          return healthScore;
        }
        return next;
      });
    }, 55);

    return () => {
      window.clearTimeout(timer);
    };
  }, [displayHealthScore, healthScore]);

  useEffect(() => {
    const prev = previousSeverity.current;
    if (
      (severity === "WARNING" || severity === "CRITICAL") &&
      (prev === "NORMAL" || (prev === "WARNING" && severity === "CRITICAL"))
    ) {
      const message =
        severity === "CRITICAL"
          ? "Critical HVAC anomaly detected. Immediate attention recommended."
          : "Warning: system behavior is drifting from baseline.";
      setToastMessage(message);

      try {
        const audioCtx = new window.AudioContext();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = severity === "CRITICAL" ? 880 : 660;
        gainNode.gain.value = 0.03;
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
      } catch {
        // Audio may be blocked by browser policies; toast still provides immediate feedback.
      }
    }
    previousSeverity.current = severity;
  }, [severity]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = window.setTimeout(() => setToastMessage(null), 3500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toastMessage]);

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
        setHealthScore(100);
        setDisplayHealthScore(100);
        setLeakProbability(0);
        setLeakLabel("LOW");
        setEfficiencyScore(100);
        setCostImpactLow(0);
        setCostImpactHigh(0);
        setFailureWindow("30+ days");
        setAiDiagnosis("");
        setToastMessage(null);
        setLeakEventTime(null);
        setLatestData(null);
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

  const healthColor =
    displayHealthScore >= 70 ? "text-emerald-400" : displayHealthScore >= 40 ? "text-amber-400" : "text-rose-400";

  const leakBadgeStyle =
    leakLabel === "HIGH"
      ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/50"
      : leakLabel === "MEDIUM"
        ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
        : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";

  return (
    <main className={`relative min-h-screen overflow-hidden px-4 pb-12 pt-10 sm:px-8 lg:px-12 ${severity === "CRITICAL" ? "critical-scene" : ""}`}>
      <div className="ghost-orb ghost-orb-left" aria-hidden="true" />
      <div className="ghost-orb ghost-orb-right" aria-hidden="true" />

      {toastMessage ? (
        <div className="fixed right-4 top-4 z-50 animate-toastIn rounded-xl border border-rose-400/60 bg-rose-950/90 px-4 py-3 text-sm text-rose-100 shadow-[0_0_30px_-8px_rgba(244,63,94,0.8)]">
          {toastMessage}
        </div>
      ) : null}

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

        {severity === "CRITICAL" ? (
          <section className="critical-banner animate-criticalBanner rounded-2xl border border-rose-400/60 bg-rose-950/60 p-4 shadow-[0_0_45px_-10px_rgba(244,63,94,0.9)]">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-200">Live Incident</p>
            <p className="mt-1 text-base text-rose-100 sm:text-lg">
              Live system currently experiencing critical performance degradation.
            </p>
          </section>
        ) : null}

        {/* ── EXECUTIVE ROW ─────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* System Status */}
          <StatusCard severity={severity} alerts={currentAlerts} lastUpdated={lastUpdated} />

          {/* Health Score */}
          <section className={`flex flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur ${severity === "CRITICAL" ? "animate-healthDrop" : ""}`}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              System Health
            </p>
            <p className={`font-heading text-6xl font-bold tabular-nums ${healthColor}`}>
              {displayHealthScore}
            </p>
            <p className="mt-1 text-xs text-slate-500">out of 100</p>
            <div className="mt-3 h-2 w-full rounded-full bg-slate-800">
              <div
                className={`h-2 rounded-full transition-all duration-700 ${
                  displayHealthScore >= 70 ? "bg-emerald-500" : displayHealthScore >= 40 ? "bg-amber-500" : "bg-rose-500"
                }`}
                style={{ width: `${displayHealthScore}%` }}
              />
            </div>
          </section>

          {/* Leak Probability */}
          <section className="flex flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Leak Probability
            </p>
            <p className="font-heading text-6xl font-bold tabular-nums text-slate-100">
              {leakProbability}%
            </p>
            <span className={`mt-3 rounded-full px-4 py-1 text-sm font-semibold ${leakBadgeStyle}`}>
              {leakLabel}
            </span>
          </section>
        </div>

        {/* ── TECHNICAL ROW ─────────────────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          {(
            [
              { label: "Pressure", value: latestData?.pressure ?? "—", unit: "PSI", color: "text-cyan-400" },
              { label: "Runtime",  value: latestData?.runtime  ?? "—", unit: "min", color: "text-amber-400" },
              { label: "Superheat", value: latestData?.superheat ?? "—", unit: "°F", color: "text-violet-400" },
              { label: "Delta-T",  value: latestData?.delta_t  ?? "—", unit: "°F", color: "text-sky-400" },
            ] as const
          ).map(({ label, value, unit, color }) => (
            <section
              key={label}
              className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 backdrop-blur"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
              <p className={`font-heading mt-1 text-3xl font-bold tabular-nums ${color}`}>
                {typeof value === "number" ? value.toFixed(1) : value}
              </p>
              <p className="text-xs text-slate-600">{unit}</p>
            </section>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Efficiency</p>
            <p className="font-heading mt-1 text-3xl font-bold tabular-nums text-emerald-300">
              {efficiencyScore}%
            </p>
            <p className="text-xs text-slate-500">Energy efficiency estimate</p>
          </section>
          <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Estimated Failure Window</p>
            <p className="font-heading mt-1 text-3xl font-bold tabular-nums text-amber-300">
              {failureWindow}
            </p>
            <p className="text-xs text-slate-500">Predictive downtime estimate</p>
          </section>
          <section className="rounded-2xl border border-rose-500/25 bg-rose-950/25 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">Estimated Cost Impact</p>
            <p className="font-heading mt-1 text-3xl font-bold tabular-nums text-rose-200">
              ${costImpactLow}-${costImpactHigh}
            </p>
            <p className="text-xs text-rose-200/80">per month in wasted energy if unresolved</p>
            <p className="mt-1 text-xs text-rose-200/70">
              Profile: {customerProfile === "enterprise" ? "Multi-site Enterprise" : customerProfile === "industrial" ? "Industrial" : "Retail"}
            </p>
          </section>
        </div>

        {/* ── CHART ─────────────────────────────────────────────────────── */}
        <Chart data={history} leakEventTime={leakEventTime} isCritical={severity === "CRITICAL"} />

        {/* ── AI EXPLANATION ────────────────────────────────────────────── */}
        {aiDiagnosis && (
          <section className="rounded-2xl border border-violet-500/25 bg-slate-950/80 p-6 backdrop-blur">
            <h2 className="font-heading text-xl tracking-wide text-violet-300">
              AI Diagnosis
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-300">
              {aiDiagnosis}
            </p>
          </section>
        )}

        {/* ── CONTROLS ──────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur">
          <h2 className="font-heading text-xl tracking-wide text-slate-100">Controls</h2>
          <p className="mt-1 text-sm text-slate-400">
            Polling every 2.5 s. Trigger leak mode to stress the thermodynamic model.
          </p>
          <div className="mt-4 max-w-xs">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Customer Profile
            </label>
            <select
              value={customerProfile}
              onChange={(e) => setCustomerProfile(e.target.value as CustomerProfile)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="retail">Retail HVAC</option>
              <option value="industrial">Industrial HVAC</option>
              <option value="enterprise">Multi-site Enterprise</option>
            </select>
          </div>
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
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
            {isLoading ? "Fetching telemetry…" : "Realtime feed active"}
            {errorMessage ? <p className="mt-2 text-rose-300">Error: {errorMessage}</p> : null}
          </div>
        </section>

        {/* ── GET ALERTS ────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-6 shadow-[0_0_60px_-20px_rgba(6,182,212,0.25)] backdrop-blur">
          <h2 className="font-heading text-xl tracking-wide text-cyan-300">Get Alerts</h2>
          <p className="mt-1 text-sm text-slate-400">
            Enter your phone or email and we&apos;ll text you the moment we detect a problem.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="tel"
              placeholder="Phone (e.g. +15550001234)"
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
          {subscribeStatus ? <p className="mt-3 text-sm text-cyan-300">{subscribeStatus}</p> : null}
        </section>

        {/* ── ALERT LOG ─────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-6 backdrop-blur">
          <h2 className="font-heading text-xl tracking-wide text-slate-100">Recent Alert Log</h2>
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
