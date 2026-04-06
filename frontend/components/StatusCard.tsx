type Severity = "NORMAL" | "WARNING" | "CRITICAL";

type StatusCardProps = {
  severity: Severity;
  alerts: string[];
  lastUpdated: string | null;
};

const severityStyles: Record<
  Severity,
  { label: string; badge: string; border: string }
> = {
  NORMAL: {
    label: "System stable",
    badge: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40",
    border: "border-emerald-500/40",
  },
  WARNING: {
    label: "Monitor closely",
    badge: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40",
    border: "border-amber-500/40",
  },
  CRITICAL: {
    label: "Immediate attention",
    badge:
      "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/50 animate-criticalPulse",
    border: "border-rose-500/50",
  },
};

export default function StatusCard({
  severity,
  alerts,
  lastUpdated,
}: StatusCardProps) {
  const style = severityStyles[severity];

  return (
    <section
      className={`rounded-2xl border ${style.border} bg-slate-950/70 p-6 shadow-[0_0_60px_-20px_rgba(30,41,59,0.9)] backdrop-blur`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl tracking-wide text-slate-100">
            System Status
          </h2>
          <p className="text-sm text-slate-400">{style.label}</p>
        </div>
        <span className={`rounded-full px-4 py-1 text-sm font-semibold ${style.badge}`}>
          {severity}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-300">Active Alerts</h3>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">No active alerts.</p>
        ) : (
          <ul className="space-y-1 text-sm text-slate-300">
            {alerts.map((alert, idx) => (
              <li key={`${alert}-${idx}`}>• {alert}</li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-5 text-xs tracking-wide text-slate-500">
        Last updated: {lastUpdated ?? "Waiting for first reading"}
      </p>
    </section>
  );
}
