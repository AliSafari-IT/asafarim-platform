"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  roles: string[];
  hasStudentProfile: boolean;
  hasTutorProfile: boolean;
  tutorVerified: boolean;
  studentGradeLevel: string | null;
  tutorSubjects: string[];
  tutorRating: number | null;
};

export default function UsersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ items: UserRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q) params.set("search", q);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [load, search]);

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.admin.users.title")}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{t("edumatch.admin.users.subtitle")}</p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("edumatch.admin.users.searchPlaceholder")}
            className="w-full sm:w-64 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.common.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t("edumatch.admin.users.noUsers")}</p>
      ) : (
        <>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">{t("edumatch.admin.common.total", { n: data.total })}</p>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {data.items.map((u) => (
              <div key={u.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-text)] truncate">{u.name ?? "-"}</p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">{u.email}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {u.hasStudentProfile && (
                      <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400">{t("edumatch.admin.users.student")}</span>
                    )}
                    {u.hasTutorProfile && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">{t("edumatch.admin.users.tutor")}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {u.roles.map((r) => (
                    <span key={r} className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>
                    {u.hasTutorProfile ? (
                      u.tutorVerified ? (
                        <span className="text-green-400">{t("edumatch.admin.users.verifiedTutor")}</span>
                      ) : (
                        <span className="text-yellow-400">{t("edumatch.admin.users.unverifiedTutor")}</span>
                      )
                    ) : null}
                  </span>
                  <span>{t("edumatch.admin.users.joined")} {new Date(u.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.users.name")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.users.email")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.users.roles")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.users.profiles")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.users.tutorStatus")}</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)]">{t("edumatch.admin.users.joined")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                    <td className="px-3 py-2 text-[var(--color-text)]">{u.name ?? "-"}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{u.email}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span key={r} className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {u.hasStudentProfile && (
                          <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400">{t("edumatch.admin.users.student")}</span>
                        )}
                        {u.hasTutorProfile && (
                          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">{t("edumatch.admin.users.tutor")}</span>
                        )}
                        {!u.hasStudentProfile && !u.hasTutorProfile && (
                          <span className="text-[var(--color-text-muted)] text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {u.hasTutorProfile ? (
                        u.tutorVerified ? (
                          <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">{t("edumatch.admin.users.verified")}</span>
                        ) : (
                          <span className="rounded-full bg-yellow-500/15 px-1.5 py-0.5 text-[10px] text-yellow-400">{t("edumatch.admin.users.unverified")}</span>
                        )
                      ) : (
                        <span className="text-[var(--color-text-muted)] text-xs">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{new Date(u.createdAt).toLocaleDateString()}</td>
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
