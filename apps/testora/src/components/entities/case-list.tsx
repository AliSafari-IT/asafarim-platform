"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CaseForm } from "@/components/forms/case-form";
import { DeleteButton } from "@/components/delete-button";
import { Code2, Pencil, X } from "lucide-react";
import { EntityRow, ListToolbar, matchesStatus, type StatusFilter } from "./list-ui";
import type { AggregateResult } from "@/lib/run-status";

type ScriptType = "single" | "multi" | "scripted";

export interface CaseItem {
  caseId: string;
  fixtureId: string;
  title: string;
  scriptType: ScriptType;
  input?: Record<string, unknown> | null;
  runs?: Record<string, unknown>[] | null;
  expected?: Record<string, unknown> | null;
  script?: string | null;
  fixtureTitle?: string;
  result: AggregateResult | null;
}

interface FixtureOption {
  fixtureId: string;
  title: string;
}

export function CaseListView({
  cases,
  fixtureOptions,
}: {
  cases: CaseItem[];
  fixtureOptions: FixtureOption[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cases.filter((c) => {
      const hay = `${c.title} ${c.caseId} ${c.fixtureTitle ?? ""} ${c.scriptType}`.toLowerCase();
      return hay.includes(needle) && matchesStatus(c.result, status);
    });
  }, [cases, search, status]);

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        shown={filtered.length}
        total={cases.length}
        placeholder="Search cases by title, id or fixture..."
      />
      {filtered.map((testCase) => (
        <CaseRow key={testCase.caseId} testCase={testCase} fixtureOptions={fixtureOptions} />
      ))}
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {cases.length === 0 ? "No test cases yet." : "No cases match your filters."}
        </p>
      )}
    </div>
  );
}

function CaseRow({
  testCase,
  fixtureOptions,
}: {
  testCase: CaseItem;
  fixtureOptions: FixtureOption[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <CaseForm
          mode="edit"
          initial={testCase}
          fixtureOptions={fixtureOptions}
          onSuccess={() => setEditing(false)}
        />
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    );
  }

  const isScripted = testCase.scriptType === "scripted";
  const scriptText = isScripted
    ? testCase.script ?? ""
    : JSON.stringify(testCase.scriptType === "multi" ? testCase.runs : testCase.input, null, 2);

  return (
    <EntityRow
      title={testCase.title}
      meta={
        <>
          <code>{testCase.caseId}</code>
          {testCase.fixtureTitle ? ` · ${testCase.fixtureTitle}` : ""}
        </>
      }
      typeBadge={
        <Badge variant={testCase.scriptType === "single" ? "outline" : "default"}>
          {testCase.scriptType}
        </Badge>
      }
      result={testCase.result}
      actions={
        <>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!scriptText} title="View script / data">
                <Code2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{testCase.title}</DialogTitle>
                <DialogDescription>
                  {testCase.caseId} · {testCase.scriptType}
                </DialogDescription>
              </DialogHeader>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {scriptText || "(empty)"}
              </pre>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <DeleteButton
            url={`/api/cases/${testCase.caseId}`}
            label=""
            confirmText={`Delete case "${testCase.title}"?`}
          />
        </>
      }
    />
  );
}
