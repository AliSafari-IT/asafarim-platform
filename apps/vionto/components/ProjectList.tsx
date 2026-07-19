"use client";

/**
 * ProjectList — full CRUD project management table.
 *
 * Features:
 *  - Table/grid showing owned + shared projects
 *  - Inline search, sort, pagination
 *  - Actions: open/select, rename, delete (owned), manage sharing (owned)
 *  - Modals: Create, Edit, Delete confirm, Share management
 *  - "selector" mode: shows a "Select" button per row for the video-creation flow
 */

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Pencil,
  Search,
  Share2,
  Trash2,
  UserMinus,
  UserPlus,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectRow = {
  id: string;
  title: string;
  description?: string | null;
  mode: string;
  storyMode?: string | null;
  status: string;
  aspectRatio: string;
  locale: string;
  userId: string;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { assets: number; scripts: number; exports: number };
};

type Share = {
  id: string;
  email: string;
  permission: string;
  createdAt: string;
  isRegistered?: boolean;
  sharedWith?: { id: string; name?: string | null; image?: string | null } | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ─── Props ────────────────────────────────────────────────────────────────────

export type ProjectListProps = {
  /** When provided, renders a "Select" action button and calls this when clicked */
  onSelect?: (project: ProjectRow) => void;
  /** Initial project to highlight (e.g. currently active one) */
  selectedProjectId?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Translate = (key: string, values?: Record<string, string | number>) => string;

function statusBadge(status: string, t: Translate) {
  const map: Record<string, string> = {
    draft: "bg-[var(--color-border)] text-[var(--color-text-muted)]",
    ready: "bg-blue-500/15 text-blue-400",
    rendering: "bg-amber-500/15 text-amber-400",
    completed: "bg-emerald-500/15 text-emerald-400",
    archived: "bg-[var(--color-border)] text-[var(--color-text-muted)]",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map.draft}`}>
      {t(`vionto.projects.status.${status}`)}
    </span>
  );
}

function modeBadge(mode: string, storyMode: string | null | undefined, t: Translate) {
  const modeLabel = t(`vionto.mode.${mode}`);
  const storyModeLabel = storyMode ? t(`vionto.storyMode.${storyMode}`) : "";
  const label = storyModeLabel ? `${modeLabel} / ${storyModeLabel}` : modeLabel;
  return (
    <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">
      {label}
    </span>
  );
}

function fmtDate(iso: string, locale?: string) {
  return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

// ─── Modal backdrop ───────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <button type="button" onClick={onClose} aria-label={t("common.close")}
        className="mt-0.5 rounded-full p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function FieldInput({
  label, id, value, onChange, placeholder, maxLength, required, autoFocus,
}: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number; required?: boolean; autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}{required && " *"}</label>
      <input
        id={id}
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none ring-[var(--color-primary)] focus:ring-2 placeholder:text-[var(--color-text-muted)]"
      />
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 hover:opacity-90"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {loading ? (loadingLabel ?? label) : label}
    </button>
  );
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

type CreateEditModalProps = {
  project?: ProjectRow | null;
  onClose: () => void;
  onSaved: (p: ProjectRow) => void;
};

function CreateEditModal({ project, onClose, onSaved }: CreateEditModalProps) {
  const { t } = useTranslation();
  const isEdit = !!project;
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError(t("vionto.projects.titleRequired")); return; }
    setError("");
    setLoading(true);

    try {
      const url = isEdit ? `/api/projects/${project!.id}` : "/api/projects";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? t("vionto.projects.genericError")); return; }
      onSaved(data as ProjectRow);
    } catch {
      setError(t("vionto.projects.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader title={isEdit ? t("vionto.projects.renameTitle") : t("vionto.projects.newTitle")} onClose={onClose} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldInput
          label={t("vionto.projects.fieldTitle")} id="project-title" autoFocus required
          value={title} onChange={setTitle} maxLength={120}
          placeholder={t("vionto.projects.titleExample")}
        />
        <div className="space-y-1.5">
          <label htmlFor="project-desc" className="block text-sm font-medium">{t("vionto.projects.fieldDescription")}</label>
          <textarea
            id="project-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("vionto.projects.descriptionPlaceholder")}
            maxLength={2000}
            rows={3}
            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none ring-[var(--color-primary)] focus:ring-2 placeholder:text-[var(--color-text-muted)] resize-none"
          />
        </div>
        {error && <FormError message={error} />}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--color-border-strong)] px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--color-surface)]">
            {t("common.cancel")}
          </button>
          <div className="flex-1">
            <SubmitButton
              loading={loading}
              label={isEdit ? t("vionto.projects.save") : t("vionto.projects.newProject")}
              loadingLabel={isEdit ? t("vionto.projects.saving") : t("vionto.projects.creating")}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({
  project, onClose, onDeleted,
}: {
  project: ProjectRow; onClose: () => void; onDeleted: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? t("vionto.projects.deleteFailed")); return; }
      onDeleted(project.id);
    } catch {
      setError(t("vionto.projects.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader title={t("vionto.projects.deleteTitle")} onClose={onClose} />
      <p className="mb-2 text-sm text-[var(--color-text-muted)]">
        {t("vionto.projects.deleteIntro")} <strong className="text-[var(--color-text)]">{project.title}</strong>{" "}
        {t("vionto.projects.deleteOutro")}
      </p>
      {project._count.assets > 0 && (
        <p className="mb-4 flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {t(project._count.assets === 1 ? "vionto.projects.assetWillBeRemoved" : "vionto.projects.assetsWillBeRemoved", { count: project._count.assets })}
        </p>
      )}
      {error && <FormError message={error} />}
      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onClose}
          className="flex-1 rounded-xl border border-[var(--color-border-strong)] px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--color-surface)]">
          {t("common.cancel")}
        </button>
        <button type="button" onClick={handleDelete} disabled={loading}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 hover:bg-red-700">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? t("vionto.projects.deleting") : t("vionto.projects.deleteProject")}
        </button>
      </div>
    </Modal>
  );
}

// ─── Share management modal ───────────────────────────────────────────────────

function ShareModal({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const { t, locale } = useTranslation();
  const [shares, setShares] = useState<Share[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"viewer" | "editor">("viewer");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");

  const fetchShares = useCallback(async () => {
    setLoadingShares(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/shares`);
      const data = await res.json();
      if (res.ok) setShares(data.data ?? []);
    } finally {
      setLoadingShares(false);
    }
  }, [project.id]);

  useEffect(() => { fetchShares(); }, [fetchShares]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(""); setAddSuccess("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setAddError(t("vionto.projects.emailRequired")); return; }
    setAddLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, permission }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data?.error ?? t("vionto.projects.shareFailed")); return; }
      setEmail("");
      if (!data.isRegistered) {
        setAddSuccess(t("vionto.projects.sharePending", { email: trimmed }));
      } else {
        setAddSuccess(t("vionto.projects.shareAdded", { email: trimmed, permission: t(`vionto.projects.permission.${permission}`) }));
      }
      await fetchShares();
    } catch {
      setAddError(t("vionto.projects.networkError"));
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(shareId: string) {
    setRemoveError(""); setRemovingId(shareId);
    try {
      const res = await fetch(`/api/projects/${project.id}/shares?shareId=${shareId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setRemoveError(data?.error ?? t("vionto.projects.removeFailed")); return; }
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch {
      setRemoveError(t("vionto.projects.networkError"));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader title={t("vionto.projects.shareTitle", { title: project.title })} onClose={onClose} />

      {/* Add share form */}
      <form onSubmit={handleAdd} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("vionto.project.emailPlaceholder")}
            autoFocus
            className="flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none ring-[var(--color-primary)] focus:ring-2 placeholder:text-[var(--color-text-muted)]"
          />
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as "viewer" | "editor")}
            className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-2.5 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
          >
            <option value="viewer">{t("vionto.projects.permission.viewer")}</option>
            <option value="editor">{t("vionto.projects.permission.editor")}</option>
          </select>
        </div>
        {addError && <FormError message={addError} />}
        {addSuccess && (
          <p className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {addSuccess}
          </p>
        )}
        <button type="submit" disabled={addLoading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-primary)] transition disabled:opacity-60 hover:bg-[var(--color-primary)]/10">
          {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {addLoading ? t("vionto.projects.adding") : t("vionto.projects.addPerson")}
        </button>
      </form>

      {/* People list */}
      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {t("vionto.projects.peopleWithAccess")}
        </p>

        {loadingShares ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : shares.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
            {t("vionto.projects.noSharedUsers")}
          </p>
        ) : (
          <ul className="space-y-2">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-border)] text-xs font-semibold uppercase">
                  {s.sharedWith?.name?.[0] ?? s.email[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {s.sharedWith?.name ?? s.email}
                  </p>
                  {s.sharedWith?.name && (
                    <p className="truncate text-xs text-[var(--color-text-muted)]">{s.email}</p>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {t(`vionto.projects.permission.${s.permission}`)} · {t("vionto.projects.added")} {fmtDate(s.createdAt, locale)}
                    {!s.sharedWith && ` · ${t("vionto.projects.pendingRegistration")}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(s.id)}
                  disabled={removingId === s.id}
                  aria-label={t("vionto.projects.removePerson", { email: s.email })}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  {removingId === s.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <UserMinus className="h-4 w-4" />
                  }
                </button>
              </li>
            ))}
          </ul>
        )}
        {removeError && <FormError message={removeError} />}
      </div>
    </Modal>
  );
}

// ─── Actions menu ─────────────────────────────────────────────────────────────

type ActionMenuProps = {
  project: ProjectRow;
  onSelect?: (p: ProjectRow) => void;
  onEdit: (p: ProjectRow) => void;
  onDelete: (p: ProjectRow) => void;
  onShare: (p: ProjectRow) => void;
  isSelected: boolean;
};

function ActionMenu({ project, onSelect, onEdit, onDelete, onShare, isSelected }: ActionMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 192, // 192px = w-48
      });
    }
  }, [open]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const btn = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-[var(--color-surface)]";

  const dropdown = open && (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-48 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-1.5 shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {!onSelect && (
        <a
          href={`/create?projectId=${project.id}`}
          className={btn + " text-[var(--color-text)]"}
          onClick={() => setOpen(false)}
        >
          <FolderOpen className="h-4 w-4" />
          {t("vionto.projects.openProject")}
          <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
        </a>
      )}
      {project.isOwner && (
        <>
          <button type="button" className={btn} onClick={() => { setOpen(false); onEdit(project); }}>
            <Pencil className="h-4 w-4" />
            {t("vionto.projects.renameEdit")}
          </button>
          <button type="button" className={btn} onClick={() => { setOpen(false); onShare(project); }}>
            <Share2 className="h-4 w-4" />
            {t("vionto.projects.manageSharing")}
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            className={btn + " text-red-400 hover:bg-red-500/10"}
            onClick={() => { setOpen(false); onDelete(project); }}
          >
            <Trash2 className="h-4 w-4" />
            {t("vionto.projects.deleteProject")}
          </button>
        </>
      )}
      {!project.isOwner && (
        <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
          {t("vionto.projects.sharedViewOnly")}
        </p>
      )}
    </div>
  );

  return (
    <div className="relative flex items-center gap-1.5">
      {onSelect && (
        <button
          type="button"
          onClick={() => onSelect(project)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            isSelected
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          }`}
        >
          {isSelected ? t("vionto.projects.selected") : t("vionto.projects.select")}
        </button>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("vionto.projects.moreActions")}
        className="rounded-lg border border-[var(--color-border-strong)] p-1.5 text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
          <circle cx="8" cy="3" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="8" cy="13" r="1.2" />
        </svg>
      </button>

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectList({ onSelect, selectedProjectId }: ProjectListProps) {
  const { t, locale } = useTranslation();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectRow | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectRow | null>(null);
  const [shareProject, setShareProject] = useState<ProjectRow | null>(null);

  const fetchProjects = useCallback(async (page: number, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        sortBy: "updatedAt",
        sortOrder: "desc",
        ...(q ? { search: q } : {}),
      });
      const res = await fetch(`/api/projects?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data.data ?? []);
      setPagination(data.pagination ?? { page, pageSize: 20, total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects(1, search);
  }, [fetchProjects, search]);

  function handleSearchInput(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(v.trim());
    }, 300);
  }

  function handleSaved(p: ProjectRow) {
    setCreateOpen(false);
    setEditProject(null);
    // Optimistically insert or update
    setProjects((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = p;
        return next;
      }
      return [p, ...prev];
    });
    setPagination((pag) => ({ ...pag, total: pag.total + 1 }));
  }

  function handleDeleted(id: string) {
    setDeleteProject(null);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setPagination((pag) => ({ ...pag, total: Math.max(0, pag.total - 1) }));
  }

  const isEmpty = !loading && projects.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder={t("vionto.projects.searchPlaceholder")}
            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-2.5 pl-9 pr-4 text-sm outline-none ring-[var(--color-primary)] focus:ring-2 placeholder:text-[var(--color-text-muted)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <FilePlus2 className="h-4 w-4" />
          {t("vionto.projects.newProject")}
        </button>
      </div>

      {/* Table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--color-border-strong)] md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-4 py-3">{t("vionto.projects.columnProject")}</th>
              <th className="px-4 py-3">{t("vionto.projects.columnMode")}</th>
              <th className="px-4 py-3">{t("vionto.projects.columnStatus")}</th>
              <th className="px-4 py-3">{t("vionto.projects.columnAssets")}</th>
              <th className="px-4 py-3">{t("vionto.projects.columnAccess")}</th>
              <th className="px-4 py-3">{t("vionto.projects.columnUpdated")}</th>
              <th className="px-4 py-3 text-right">{t("vionto.projects.columnActions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded-full bg-[var(--color-border)]" />
                    </td>
                  ))}
                </tr>
              ))
            )}

            {!loading && isEmpty && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                    <FilePlus2 className="h-10 w-10 text-[var(--color-text-muted)]" />
                    <p className="font-medium">
                      {search ? t("vionto.projects.emptySearchTitle") : t("vionto.projects.emptyTitle")}
                    </p>
                    <p className="text-[var(--color-text-muted)]">
                      {search
                        ? t("vionto.projects.emptySearchDescription")
                        : t("vionto.projects.emptyDescription")
                      }
                    </p>
                    {!search && (
                      <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="mt-1 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                      >
                        {t("vionto.projects.newProject")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {!loading && projects.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-[var(--color-border)] last:border-0 transition hover:bg-[var(--color-surface)]/50 ${
                  selectedProjectId === p.id ? "bg-[var(--color-primary)]/5" : ""
                }`}
              >
                {/* Title */}
                <td className="px-4 py-3">
                  <div className="max-w-[220px]">
                    <p className="truncate font-medium">{p.title}</p>
                    {p.description && (
                      <p className="truncate text-xs text-[var(--color-text-muted)]">{p.description}</p>
                    )}
                  </div>
                </td>

                {/* Mode */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {modeBadge(p.mode, p.storyMode, t)}
                </td>

                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {statusBadge(p.status, t)}
                </td>

                {/* Assets count */}
                <td className="px-4 py-3 text-[var(--color-text-muted)]">
                  {p._count.assets}
                </td>

                {/* Owner / shared badge */}
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    p.isOwner
                      ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                      : "border border-[var(--color-border)] text-[var(--color-text-muted)]"
                  }`}>
                    {p.isOwner ? t("vionto.projects.owner") : t("vionto.projects.shared")}
                  </span>
                </td>

                {/* Updated */}
                <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                  {fmtDate(p.updatedAt, locale)}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-right">
                  <ActionMenu
                    project={p}
                    onSelect={onSelect}
                    onEdit={setEditProject}
                    onDelete={setDeleteProject}
                    onShare={setShareProject}
                    isSelected={selectedProjectId === p.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-[var(--color-border)]" />
            <div className="mt-3 h-3 w-1/2 animate-pulse rounded-full bg-[var(--color-border)]" />
            <div className="mt-4 h-9 w-full animate-pulse rounded-xl bg-[var(--color-border)]" />
          </div>
        ))}

        {!loading && isEmpty && (
          <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] px-5 py-12 text-center">
            <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
              <FilePlus2 className="h-10 w-10 text-[var(--color-text-muted)]" />
              <p className="font-medium">
                {search ? t("vionto.projects.emptySearchTitle") : t("vionto.projects.emptyTitle")}
              </p>
              <p className="text-sm text-[var(--color-text-muted)]">
                {search ? t("vionto.projects.emptySearchDescription") : t("vionto.projects.emptyDescription")}
              </p>
              {!search && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-1 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  {t("vionto.projects.newProject")}
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && projects.map((p) => (
          <article
            key={p.id}
            className={`rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 ${
              selectedProjectId === p.id ? "ring-2 ring-[var(--color-primary)]/40" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{p.title}</h2>
                {p.description && (
                  <p className="mt-1 break-words text-xs text-[var(--color-text-muted)]">{p.description}</p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                p.isOwner
                  ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                  : "border border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}>
                {p.isOwner ? t("vionto.projects.owner") : t("vionto.projects.shared")}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[var(--color-text-muted)]">{t("vionto.projects.columnMode")}</dt>
                <dd className="mt-1">{modeBadge(p.mode, p.storyMode, t)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">{t("vionto.projects.columnStatus")}</dt>
                <dd className="mt-1">{statusBadge(p.status, t)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">{t("vionto.projects.columnAssets")}</dt>
                <dd className="mt-1 font-medium">{p._count.assets}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">{t("vionto.projects.columnUpdated")}</dt>
                <dd className="mt-1 font-medium">{fmtDate(p.updatedAt, locale)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex justify-end border-t border-[var(--color-border)] pt-3">
              <ActionMenu
                project={p}
                onSelect={onSelect}
                onEdit={setEditProject}
                onDelete={setDeleteProject}
                onShare={setShareProject}
                isSelected={selectedProjectId === p.id}
              />
            </div>
          </article>
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-muted)]">
          <span>
            {t(pagination.total === 1 ? "vionto.projects.totalSingular" : "vionto.projects.totalPlural", { count: pagination.total })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => fetchProjects(pagination.page - 1, search)}
              className="rounded-lg border border-[var(--color-border-strong)] p-1.5 transition hover:border-[var(--color-primary)] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium text-[var(--color-text)]">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchProjects(pagination.page + 1, search)}
              className="rounded-lg border border-[var(--color-border-strong)] p-1.5 transition hover:border-[var(--color-primary)] disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {createOpen && (
        <CreateEditModal onClose={() => setCreateOpen(false)} onSaved={handleSaved} />
      )}
      {editProject && (
        <CreateEditModal project={editProject} onClose={() => setEditProject(null)} onSaved={handleSaved} />
      )}
      {deleteProject && (
        <DeleteModal project={deleteProject} onClose={() => setDeleteProject(null)} onDeleted={handleDeleted} />
      )}
      {shareProject && (
        <ShareModal project={shareProject} onClose={() => setShareProject(null)} />
      )}
    </div>
  );
}
