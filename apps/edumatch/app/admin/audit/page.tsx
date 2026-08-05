"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { useAdminFetch } from "../useAdminFetch";

type AuditEvent = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  prevState: string | null;
  nextState: string | null;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string | null } | null;
};

const ENTITY_OPTIONS = [
  "",
  "EduInquiry",
  "EduAiResponse",
  "EduQuote",
  "EduBooking",
  "EduTransaction",
  "EduTutorVerification",
  "EduTutorProfile",
] as const;

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditPage() {
  const { t } = useTranslation();
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const params = new URLSearchParams({ limit: "100" });
  if (entityFilter) params.set("entity", entityFilter);
  if (actionFilter) params.set("action", actionFilter);

  const { data, loading, error } = useAdminFetch<{ events: AuditEvent[] }>(
    `/api/admin/audit?${params}`,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">{t("edumatch.admin.audit.title")}</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">{t("edumatch.admin.audit.subtitle")}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 mb-6">
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
        >
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>{e || t("edumatch.admin.audit.allEntities")}</option>
          ))}
        </select>
        <input
          type="text"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder={t("edumatch.admin.audit.filterAction")}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
        />
      </div>

      {error && <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
      ) : !data || data.events.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.audit.noEvents")}</p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {data.events.map((e) => (
              <div key={e.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-[var(--color-text)] break-all">{e.action}</span>
                  {e.actorRole && <RoleBadge role={e.actorRole} />}
                </div>
                <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                  <p>
                    <span className="font-medium">{t("edumatch.admin.audit.entity")}:</span> {e.entity}
                    {e.entityId && <span className="opacity-60"> {e.entityId.slice(0, 8)}...</span>}
                  </p>
                  {(e.prevState || e.nextState) && (
                    <p>
                      <span className="font-medium">{t("edumatch.admin.audit.transition")}:</span>{" "}
                      {e.prevState && <span className="text-red-400">{e.prevState}</span>}
                      {e.prevState && e.nextState && " → "}
                      {e.nextState && <span className="text-green-400">{e.nextState}</span>}
                    </p>
                  )}
                  <p>
                    <span className="font-medium">{t("edumatch.admin.audit.actor")}:</span>{" "}
                    {e.actor ? (e.actor.name ?? e.actor.email) : e.actorId ? e.actorId.slice(0, 8) : t("edumatch.admin.audit.system")}
                  </p>
                  {e.reason && <p className="line-clamp-2"><span className="font-medium">{t("edumatch.admin.audit.reason")}:</span> {e.reason}</p>}
                  <p className="text-[var(--color-text-muted)] opacity-60">{formatTime(e.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.audit.action")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.audit.entity")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.audit.transition")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.audit.actor")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.audit.role")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.audit.reason")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.audit.time")}</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                    <td className="px-3 py-2 font-medium text-[var(--color-text)]">{e.action}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">
                      {e.entity}
                      {e.entityId && <span className="text-[var(--color-text-muted)] opacity-60"> {e.entityId.slice(0, 8)}...</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">
                      {e.prevState || e.nextState ? (
                        <>
                          {e.prevState && <span className="text-red-400">{e.prevState}</span>}
                          {e.prevState && e.nextState && <span> &rarr; </span>}
                          {e.nextState && <span className="text-green-400">{e.nextState}</span>}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">
                      {e.actor ? (e.actor.name ?? e.actor.email) : e.actorId ? e.actorId.slice(0, 8) : t("edumatch.admin.audit.system")}
                    </td>
                    <td className="px-3 py-2">
                      {e.actorRole && <RoleBadge role={e.actorRole} />}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] max-w-[200px] truncate" title={e.reason ?? ""}>
                      {e.reason ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] whitespace-nowrap">{formatTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    STUDENT: "bg-blue-500/15 text-blue-400",
    TUTOR: "bg-emerald-500/15 text-emerald-400",
    ADMIN: "bg-purple-500/15 text-purple-400",
    SYSTEM: "bg-gray-500/15 text-gray-400",
  };
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[role] ?? "bg-gray-500/15 text-gray-400"}`}>
      {role}
    </span>
  );
}
