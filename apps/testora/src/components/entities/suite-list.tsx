"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuiteForm } from "@/components/forms/suite-form";
import { DeleteButton } from "@/components/delete-button";
import { Pencil, X } from "lucide-react";
import { EntityRow, ListToolbar, matchesStatus, type StatusFilter } from "./list-ui";
import type { AggregateResult } from "@/lib/run-status";

export interface SuiteItem {
  suiteId: string;
  frId: string;
  title: string;
  description: string;
  fixtureCount: number;
  frTitle?: string;
  result: AggregateResult | null;
}

interface FrOption {
  id: string;
  title: string;
}

export function SuiteListView({
  suites,
  frOptions,
}: {
  suites: SuiteItem[];
  frOptions: FrOption[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return suites.filter((s) => {
      const hay = `${s.title} ${s.suiteId} ${s.frTitle ?? ""} ${s.description}`.toLowerCase();
      return hay.includes(needle) && matchesStatus(s.result, status);
    });
  }, [suites, search, status]);

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        shown={filtered.length}
        total={suites.length}
        placeholder="Search suites by title, id or requirement..."
      />
      {filtered.map((suite) => (
        <SuiteRow key={suite.suiteId} suite={suite} frOptions={frOptions} />
      ))}
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {suites.length === 0 ? "No test suites yet." : "No suites match your filters."}
        </p>
      )}
    </div>
  );
}

function SuiteRow({ suite, frOptions }: { suite: SuiteItem; frOptions: FrOption[] }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <SuiteForm
          mode="edit"
          initial={suite}
          frOptions={frOptions}
          onSuccess={() => setEditing(false)}
        />
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <EntityRow
      title={suite.title}
      href={`/suites/${suite.suiteId}`}
      meta={
        <>
          FR: {suite.frTitle ?? suite.frId} · <code>{suite.suiteId}</code>
          {suite.description ? ` · ${suite.description}` : ""}
        </>
      }
      typeBadge={<Badge variant="outline">{suite.fixtureCount} fixture(s)</Badge>}
      result={suite.result}
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <DeleteButton
            url={`/api/suites/${suite.suiteId}`}
            label=""
            confirmText={`Delete suite "${suite.title}"? This also deletes its fixtures and cases.`}
          />
        </>
      }
    />
  );
}
