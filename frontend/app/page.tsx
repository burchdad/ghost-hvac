"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Severity = "NORMAL" | "WARNING" | "CRITICAL";
type CustomerProfile = "retail" | "industrial" | "enterprise";
type CustomerBehaviorProfile =
  | "urgent_fixer"
  | "budget_sensitive"
  | "landlord"
  | "premium";
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
  customer_profile: CustomerBehaviorProfile;
  recommendation: string;
  cost_impact_low: number;
  cost_impact_high: number;
  alert_count: number;
  runtime: number;
  last_update: string;
  ai_insight: string;
};

type CreateClientPayload = {
  name: string;
  address: string;
  device_type: string;
  system_type: string;
  portfolio_mode: "stable" | "review" | "urgent";
  customer_profile: CustomerBehaviorProfile;
};

type CreateTicketResponse = {
  message: string;
  ticket: {
    ticket_id: number;
    company_id: string;
    client_id: number;
    client_name: string;
    issue: string;
    priority: string;
    notes: string;
    assigned_to: string;
    source: string;
    status: string;
    created_at: string;
  };
};

type TicketItem = {
  ticket_id: number;
  company_id: string;
  client_id: number;
  client_name: string;
  issue: string;
  priority: string;
  notes: string;
  assigned_to: string;
  source: string;
  status: string;
  created_at: string;
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
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "tech">("admin");
  const [techName, setTechName] = useState("Mike");
  const [defaultAssignee, setDefaultAssignee] = useState("Mike");
  const [newClient, setNewClient] = useState<CreateClientPayload>({
    name: "",
    address: "",
    device_type: "residential",
    system_type: "Residential Split",
    portfolio_mode: "stable",
    customer_profile: "budget_sensitive",
  });
  const [isCreatingClient, setIsCreatingClient] = useState(false);

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

  const loadTickets = useCallback(async () => {
    setTicketsError(null);
    try {
      const baseUrl = resolveApiBaseUrl();
      if (!baseUrl) {
        throw new Error("Missing NEXT_PUBLIC_API_URL. Configure your backend URL.");
      }

      const response = await fetch(
        `${baseUrl}/tickets?company_id=${COMPANY_ID}&role=${userRole}&tech_name=${encodeURIComponent(techName)}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(`Tickets request failed with ${response.status}`);
      }

      const payload = (await response.json()) as TicketItem[];
      const openTickets = payload
        .filter((ticket) => ticket.status === "OPEN")
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      setTickets(openTickets);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ticket loading error.";
      setTicketsError(message);
    }
  }, [techName, userRole]);

  useEffect(() => {
    void loadClients();
    void loadTickets();
    const timerId = window.setInterval(() => {
      void loadClients();
      void loadTickets();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [loadClients, loadTickets]);

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

  const createTicketForClient = useCallback(
    async (client: ClientSummary) => {
      setIsActionBusy(true);
      try {
        const baseUrl = resolveApiBaseUrl();
        if (!baseUrl) {
          throw new Error("API URL not configured.");
        }
        const response = await fetch(
          `${baseUrl}/clients/${client.client_id}/tickets?company_id=${COMPANY_ID}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              issue: `Fleet alert follow-up (${client.priority})`,
              priority: client.priority,
              notes: `Auto-created from dashboard. Status=${client.status}, LeakRisk=${client.leak_risk}`,
              assigned_to: defaultAssignee,
            }),
          }
        );
        if (!response.ok) {
          throw new Error(`Ticket request failed with ${response.status}`);
        }
        const payload = (await response.json()) as CreateTicketResponse;
        setActionMessage(`Ticket #${payload.ticket.ticket_id} created for ${client.name}`);
        await loadTickets();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create ticket.";
        setActionMessage(message);
      } finally {
        setIsActionBusy(false);
      }
    },
    [defaultAssignee, loadTickets]
  );

  const downloadClientReport = useCallback(
    async (client: ClientSummary, format: "csv" | "pdf") => {
      setIsActionBusy(true);
      try {
        const baseUrl = resolveApiBaseUrl();
        if (!baseUrl) {
          throw new Error("API URL not configured.");
        }
        const response = await fetch(
          `${baseUrl}/clients/${client.client_id}/report?company_id=${COMPANY_ID}&profile=${profile}&format=${format}`,
          {
            cache: "no-store",
          }
        );
        if (!response.ok) {
          throw new Error(`Report request failed with ${response.status}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `client_${client.client_id}_report.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        setActionMessage(`${format.toUpperCase()} report downloaded for ${client.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate report.";
        setActionMessage(message);
      } finally {
        setIsActionBusy(false);
      }
    },
    [profile]
  );

  const handleCreateClient = useCallback(async () => {
    if (!newClient.name.trim() || !newClient.address.trim()) {
      setActionMessage("Name and address are required to add a client.");
      return;
    }

    setIsCreatingClient(true);
    try {
      const baseUrl = resolveApiBaseUrl();
      if (!baseUrl) {
        throw new Error("API URL not configured.");
      }

      const response = await fetch(`${baseUrl}/clients?company_id=${COMPANY_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newClient),
      });

      if (!response.ok) {
        throw new Error(`Create client failed with ${response.status}`);
      }

      setActionMessage(`Client ${newClient.name} added to dashboard.`);
      setNewClient({
        name: "",
        address: "",
        device_type: "residential",
        system_type: "Residential Split",
        portfolio_mode: "stable",
        customer_profile: "budget_sensitive",
      });
      await loadClients();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create client.";
      setActionMessage(message);
    } finally {
      setIsCreatingClient(false);
    }
  }, [loadClients, newClient]);

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
            <div className="w-full max-w-xs">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                View Role
              </label>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as "admin" | "tech")}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="admin">Admin (full fleet)</option>
                <option value="tech">Tech (assigned tickets)</option>
              </select>
            </div>
            <div className="w-full max-w-xs">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Tech Context
              </label>
              <input
                type="text"
                value={techName}
                onChange={(e) => setTechName(e.target.value || "Mike")}
                placeholder="Tech name"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
            <div className="w-full max-w-xs">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Notify Tech Defaults To
              </label>
              <input
                type="text"
                value={defaultAssignee}
                onChange={(e) => setDefaultAssignee(e.target.value || "Mike")}
                placeholder="Assignee"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <section className="mb-5 rounded-xl border border-slate-800 bg-slate-900/55 p-4">
            <h3 className="font-heading text-sm uppercase tracking-widest text-cyan-300">Add New Client</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <input
                type="text"
                value={newClient.name}
                onChange={(e) => setNewClient((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Client name"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                value={newClient.address}
                onChange={(e) => setNewClient((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Address"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
              <select
                value={newClient.system_type}
                onChange={(e) => setNewClient((prev) => ({ ...prev, system_type: e.target.value }))}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="Residential Split">Residential Split</option>
                <option value="Heat Pump Split">Heat Pump Split</option>
                <option value="RTU (Rooftop Unit)">RTU (Rooftop Unit)</option>
                <option value="Multi-zone Packaged">Multi-zone Packaged</option>
              </select>
              <select
                value={newClient.portfolio_mode}
                onChange={(e) =>
                  setNewClient((prev) => ({
                    ...prev,
                    portfolio_mode: e.target.value as "stable" | "review" | "urgent",
                  }))
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="stable">Stable</option>
                <option value="review">Review</option>
                <option value="urgent">Urgent</option>
              </select>
              <select
                value={newClient.customer_profile}
                onChange={(e) =>
                  setNewClient((prev) => ({
                    ...prev,
                    customer_profile: e.target.value as CustomerBehaviorProfile,
                  }))
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="budget_sensitive">Budget Sensitive</option>
                <option value="urgent_fixer">Urgent Fixer</option>
                <option value="landlord">Landlord</option>
                <option value="premium">Premium</option>
              </select>
              <button
                type="button"
                onClick={() => void handleCreateClient()}
                disabled={isCreatingClient}
                className="rounded-lg border border-emerald-500/45 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-60"
              >
                {isCreatingClient ? "Adding..." : "Add Client"}
              </button>
            </div>
          </section>

          {errorMessage ? (
            <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              Error: {errorMessage}
            </p>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
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
                    <th className="px-3 py-3">Recommendation</th>
                    <th className="px-3 py-3">Cost Impact</th>
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
                      <td className="max-w-[260px] truncate px-3 py-3 text-slate-300" title={client.recommendation}>
                        {client.recommendation}
                      </td>
                      <td className="px-3 py-3 text-emerald-300">
                        ${client.cost_impact_low}-${client.cost_impact_high}
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
                            onClick={() => void createTicketForClient(client)}
                            disabled={isActionBusy}
                          >
                            Notify Tech
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-300 hover:bg-violet-500/20"
                            onClick={() => void downloadClientReport(client, "csv")}
                            disabled={isActionBusy}
                          >
                            Report CSV
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-1 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-500/20"
                            onClick={() => void downloadClientReport(client, "pdf")}
                            disabled={isActionBusy}
                          >
                            Report PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                        No clients match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <aside className="h-fit rounded-xl border border-slate-800 bg-slate-900/60 p-4 xl:sticky xl:top-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-heading text-sm uppercase tracking-widest text-cyan-300">
                  Open Tickets
                </h3>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {tickets.length}
                </span>
              </div>

              {ticketsError ? (
                <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300">
                  {ticketsError}
                </p>
              ) : null}

              {tickets.length === 0 ? (
                <p className="text-sm text-slate-500">No open tickets. Notify Tech actions will appear here.</p>
              ) : (
                <ul className="space-y-2">
                  {tickets.slice(0, 12).map((ticket) => (
                    <li key={ticket.ticket_id} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-100">#{ticket.ticket_id} {ticket.client_name}</p>
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                          {ticket.priority}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{ticket.issue}</p>
                      <p className="text-[11px] text-slate-400">Assigned: {ticket.assigned_to}</p>
                      <p className="text-[11px] text-slate-500">Source: {ticket.source}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Created: {formatUpdatedTime(ticket.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            {loading ? "Refreshing client telemetry..." : `Polling every ${POLL_INTERVAL_MS / 1000}s`}
          </p>
        </section>
      </div>
    </main>
  );
}
