"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Textarea } from "@asafarim/ui";
import { api, ClientApiError, type AiOperation, type ProposalRow } from "../../lib/client/api";
import { track } from "../../lib/client/telemetry";
import { ProposalDiff } from "./ProposalDiff";

const KINDS = [
  { value: "extract_plan", label: "Turn notes into a plan" },
  { value: "decompose", label: "Break a task into subtasks" },
  { value: "acceptance_criteria", label: "Draft acceptance criteria" },
  { value: "summarize", label: "Summarize a thread" },
];

export function CopilotPanel({
  slug,
  projects,
}: {
  slug: string;
  projects: { id: string; key: string; name: string }[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState("extract_plan");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  async function generate() {
    setBusy(true);
    setStatus(null);
    setProposal(null);
    try {
      const res = await api.runAiJob(slug, { kind, input: input.trim(), projectId });
      setProposal(res.proposal);
      track({ name: "command_palette.action", action: "proposal.generated" });
      if (res.degraded) setStatus("AI provider was unavailable — this draft is from the offline model and leans on assumptions.");
    } catch (err) {
      setStatus(
        err instanceof ClientApiError && err.code === "forbidden"
          ? "AI is disabled for this workspace."
          : err instanceof ClientApiError && err.code === "rate_limited"
            ? "This workspace has hit its monthly AI budget."
            : err instanceof Error
              ? err.message
              : "Could not generate a proposal.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply(accept: number[], edited: AiOperation[]) {
    if (!proposal) return;
    setBusy(true);
    try {
      const generated = proposal.operations;
      const editedChanged = JSON.stringify(generated) !== JSON.stringify(edited);
      await api.applyProposal(
        slug,
        proposal.id,
        { projectId, accept, ...(editedChanged ? { editedOperations: edited } : {}) },
        accept.length > 15 || editedChanged,
      );
      setStatus(`Applied ${accept.length} operation(s).`);
      setShowFeedback(true);
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason?: string) {
    if (!proposal) return;
    await api.rejectProposal(slug, proposal.id, reason);
    await api.proposalFeedback(slug, proposal.id, { outcome: "rejected", correctionReason: reason });
    setProposal(null);
    setStatus("Rejected — nothing changed.");
  }

  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <h1>Copilot</h1>
      </header>
      <p className="ta-muted">
        Paste notes, a brief, or a thread. You get an editable proposal — nothing is created until
        you apply it, and every fact links to the text or is marked an assumption.
      </p>

      <div className="ta-copilot__form">
        <label>
          <span>What</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS} />
        </label>
        {projects.length > 0 && (
          <label>
            <span>Into project</span>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))}
            />
          </label>
        )}
        <Textarea
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Kickoff call notes…"
          aria-label="Source text"
        />
        <Button onClick={generate} disabled={busy || input.trim().length < 10 || !projectId}>
          {busy ? "Thinking…" : "Generate proposal"}
        </Button>
      </div>

      {status && <p className="ta-copilot__status" role="status">{status}</p>}

      {proposal && (
        <ProposalDiff
          proposal={proposal}
          busy={busy}
          onApply={apply}
          onReject={reject}
          onRegenerate={generate}
        />
      )}

      {showFeedback && proposal && (
        <FeedbackPrompt
          onSubmit={async (trust, timeSavedMin) => {
            await api.proposalFeedback(slug, proposal.id, {
              outcome: "accepted",
              trust,
              timeSavedMin,
            });
            setShowFeedback(false);
          }}
        />
      )}
    </section>
  );
}

function FeedbackPrompt({ onSubmit }: { onSubmit: (trust: number, min: number) => void }) {
  const [trust, setTrust] = useState(4);
  const [min, setMin] = useState(10);
  return (
    <div className="ta-copilot__feedback">
      <p>Quick feedback — helps tune the copilot.</p>
      <label>
        Trust (1–5)
        <input type="range" min={1} max={5} value={trust} onChange={(e) => setTrust(+e.target.value)} />
        <output>{trust}</output>
      </label>
      <label>
        Minutes saved
        <input type="number" min={0} max={600} value={min} onChange={(e) => setMin(+e.target.value)} />
      </label>
      <Button size="sm" onClick={() => onSubmit(trust, min)}>
        Send
      </Button>
    </div>
  );
}
