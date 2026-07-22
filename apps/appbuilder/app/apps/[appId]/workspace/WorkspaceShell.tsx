"use client";

import { useState } from "react";
import { Alert, Badge, Button, ButtonLink } from "@asafarim/ui";
import { routes } from "@/lib/routes";
import { StructurePanel } from "./StructurePanel";
import { PreviewPane } from "./PreviewPane";
import { ConversationPanel } from "./ConversationPanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import styles from "../workspace.module.css";
import type { SelectionContext } from "./types";

type MobilePanel = "structure" | "preview" | "conversation" | "history";
type RightTab = "conversation" | "history";

export interface WorkspaceShellProps {
  appId: string;
  appName: string;
  appStatus: "active" | "archived";
  role: "owner" | "editor" | "viewer";
  initialSpec: Record<string, unknown> | null;
  initialVersionNumber: number;
  hasPreview: boolean;
  actionError?: string;
  canArchive: boolean;
  canRestore: boolean;
}

const MOBILE_TABS: { id: MobilePanel; label: string }[] = [
  { id: "structure", label: "Structure" },
  { id: "preview", label: "Preview" },
  { id: "conversation", label: "Conversation" },
  { id: "history", label: "History" },
];

/**
 * The M08 builder workspace shell — top bar, three (desktop) / two
 * (tablet, structure as a drawer) / one-at-a-time (mobile, tab bar)
 * responsive panel layout, and a bottom status area. Replaces the M05
 * "continuation page" disclaimer entirely: this IS the real builder now.
 *
 * Owns: which structural item is selected (bounded context shared between
 * StructurePanel/PreviewPane and ConversationPanel), the app's currently
 * known version number (bumped whenever a modification/restore/undo
 * succeeds, which also remounts PreviewPane against the fresh build), and
 * the responsive panel-switching state. It never mutates the specification
 * itself — every mutation flows through the conversational modification
 * pipeline or the explicit restore/undo actions in VersionHistoryPanel.
 */
export function WorkspaceShell({
  appId,
  appName,
  appStatus,
  role,
  initialSpec,
  initialVersionNumber,
  hasPreview: initialHasPreview,
  actionError,
  canArchive,
  canRestore,
}: WorkspaceShellProps) {
  const [versionNumber, setVersionNumber] = useState(initialVersionNumber);
  const [spec, setSpec] = useState(initialSpec);
  const [hasPreview, setHasPreview] = useState(initialHasPreview);
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [activePanel, setActivePanel] = useState<MobilePanel>("preview");
  const [rightTab, setRightTab] = useState<RightTab>("conversation");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const canRequestModification = role === "owner" || role === "editor";
  const canConfirmModification = canRequestModification;
  const canCancelModification = canRequestModification;
  const canRestoreVersion = role === "owner";
  const canUndo = canRequestModification;

  async function refreshSpec(newVersionNumber: number) {
    setVersionNumber(newVersionNumber);
    setHasPreview(true);
    try {
      const res = await fetch(`/api/apps/${appId}/specification`);
      const data = await res.json();
      setSpec((data.latestVersion?.payload as Record<string, unknown>) ?? null);
    } catch {
      // Non-fatal — the structure panel simply keeps showing the last-known
      // structure until the next successful refresh.
    }
  }

  return (
    <div
      className={styles.workspace}
      data-drawer-open={drawerOpen ? "true" : "false"}
      data-active-panel={activePanel}
    >
      <header className={styles.topBar}>
        <div className={styles.topBarIdentity}>
          <button
            type="button"
            className={`ui-btn ui-btn--ghost ui-btn--sm ${styles.drawerToggle}`}
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
            aria-controls="ab-structure-panel"
          >
            Structure
          </button>
          <h1>{appName}</h1>
          <Badge tone={appStatus === "active" ? "success" : "warning"}>{appStatus === "active" ? "Active" : "Archived"}</Badge>
          <Badge tone="neutral">v{versionNumber}</Badge>
          <Badge tone={hasPreview ? "success" : "neutral"}>{hasPreview ? "Preview ready" : "No preview yet"}</Badge>
        </div>
        <div className={styles.topBarActions}>
          {hasPreview ? (
            <ButtonLink href={routes.appPreview(appId)} variant="secondary" size="sm" newTab>
              Open preview
            </ButtonLink>
          ) : null}
          {/* M11 owns real deployment — this is an explanatory, disabled affordance only. */}
          <Button type="button" size="sm" variant="ghost" disabled title="Deployment is not yet available (arrives in M11).">
            Deploy
          </Button>
          {appStatus === "active" && canArchive ? (
            <ButtonLink href={routes.appArchive(appId)} variant="danger" size="sm">
              Archive
            </ButtonLink>
          ) : null}
          {appStatus === "archived" && canRestore ? (
            <ButtonLink href={routes.appRestore(appId)} size="sm">
              Restore
            </ButtonLink>
          ) : null}
        </div>
      </header>

      {actionError === "forbidden" ? <Alert tone="error">You don&apos;t have permission to perform that action on this app.</Alert> : null}
      {actionError === "archived" ? <Alert tone="error">Restore this app before requesting a new preview build.</Alert> : null}

      <nav className={styles.tabBar} role="tablist" aria-label="Workspace panels">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activePanel === tab.id}
            className={`ui-btn ${activePanel === tab.id ? "ui-btn--primary" : "ui-btn--ghost"} ui-btn--sm`}
            onClick={() => setActivePanel(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className={styles.panels}>
        {drawerOpen ? <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} /> : null}

        <section
          id="ab-structure-panel"
          className={`${styles.panel} ${styles.structurePanel} panel--structure`}
          aria-label="Application structure"
        >
          <div className={styles.panelHeader}>
            <h2 style={{ fontSize: "var(--text-sm)", margin: 0 }}>Structure</h2>
          </div>
          <div className={styles.panelBody}>
            <StructurePanel
              spec={spec}
              versionNumber={versionNumber}
              appId={appId}
              onSelectPage={(pageId, label) => setSelection({ appId, specificationVersionNumber: versionNumber, pageId, label })}
              onSelectComponent={(pageId, componentId, componentKind, label) =>
                setSelection({ appId, specificationVersionNumber: versionNumber, pageId, componentId, componentKind, label })
              }
              onOpenHistory={() => {
                setRightTab("history");
                setActivePanel("history");
              }}
            />
          </div>
        </section>

        <section className={`${styles.panel} ${styles.previewPanel}`} aria-label="Live preview">
          <div className={styles.panelBody}>
            <PreviewPane
              appId={appId}
              hasPreview={hasPreview}
              currentVersionNumber={versionNumber}
              selection={selection}
              onSelect={setSelection}
              onClearSelection={() => setSelection(null)}
            />
          </div>
        </section>

        <section className={`${styles.panel} ${styles.rightPanel}`} aria-label="Conversation and version history">
          <div className={styles.rightPanelTabs} role="tablist" aria-label="Conversation or history">
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === "conversation"}
              className={`ui-btn ${rightTab === "conversation" ? "ui-btn--primary" : "ui-btn--ghost"} ui-btn--sm`}
              onClick={() => setRightTab("conversation")}
            >
              Conversation
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === "history"}
              className={`ui-btn ${rightTab === "history" ? "ui-btn--primary" : "ui-btn--ghost"} ui-btn--sm`}
              onClick={() => setRightTab("history")}
            >
              History
            </button>
          </div>
          <div className={styles.panelBody}>
            {rightTab === "conversation" ? (
              <ConversationPanel
                appId={appId}
                canRequestModification={canRequestModification}
                canConfirmModification={canConfirmModification}
                canCancelModification={canCancelModification}
                currentVersionNumber={versionNumber}
                selection={selection}
                onClearSelection={() => setSelection(null)}
                onVersionApplied={refreshSpec}
              />
            ) : (
              <VersionHistoryPanel
                appId={appId}
                currentVersionNumber={versionNumber}
                canRestore={canRestoreVersion}
                canUndo={canUndo}
                onChanged={refreshSpec}
              />
            )}
          </div>
        </section>
      </div>

      <footer className={styles.statusBar}>
        <span>{role === "viewer" ? "Read-only" : "All changes are saved automatically once applied."}</span>
        <span>App {appId}</span>
      </footer>
    </div>
  );
}
