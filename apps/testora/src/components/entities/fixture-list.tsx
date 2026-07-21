"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FixtureForm } from "@/components/forms/fixture-form";
import { DeleteButton } from "@/components/delete-button";
import { Pencil, PlayCircle, X } from "lucide-react";
import { EntityRow, ListToolbar, matchesStatus, type StatusFilter } from "./list-ui";
import type { AggregateResult } from "@/lib/run-status";

export interface FixtureItem {
  fixtureId: string;
  suiteId: string;
  title: string;
  baseUrl?: string | null;
  commonInput: Record<string, unknown>;
  caseCount: number;
  suiteTitle?: string;
  result: AggregateResult | null;
}

interface SuiteOption {
  suiteId: string;
  title: string;
}

export function FixtureListView({
  fixtures,
  suiteOptions,
}: {
  fixtures: FixtureItem[];
  suiteOptions: SuiteOption[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fixtures.filter((f) => {
      const hay = `${f.title} ${f.fixtureId} ${f.suiteTitle ?? ""} ${f.baseUrl ?? ""}`.toLowerCase();
      return hay.includes(needle) && matchesStatus(f.result, status);
    });
  }, [fixtures, search, status]);

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        shown={filtered.length}
        total={fixtures.length}
        placeholder="Search fixtures by title, id, suite or baseUrl..."
      />
      {filtered.map((fixture) => (
        <FixtureRow key={fixture.fixtureId} fixture={fixture} suiteOptions={suiteOptions} />
      ))}
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {fixtures.length === 0 ? "No test fixtures yet." : "No fixtures match your filters."}
        </p>
      )}
    </div>
  );
}

function FixtureRow({
  fixture,
  suiteOptions,
}: {
  fixture: FixtureItem;
  suiteOptions: SuiteOption[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <FixtureForm
          mode="edit"
          initial={fixture}
          suiteOptions={suiteOptions}
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
      title={fixture.title}
      href={`/fixtures/${fixture.fixtureId}`}
      meta={
        <>
          Suite: {fixture.suiteTitle ?? fixture.suiteId} · <code>{fixture.fixtureId}</code>
          {fixture.baseUrl ? ` · ${fixture.baseUrl}` : ""}
        </>
      }
      typeBadge={<Badge variant="outline">{fixture.caseCount} case(s)</Badge>}
      result={fixture.result}
      actions={
        <>
          <Button asChild size="sm" variant="outline" title="Run this fixture">
            <Link href={`/run?fixtureId=${fixture.fixtureId}`}>
              <PlayCircle className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <DeleteButton
            url={`/api/fixtures/${fixture.fixtureId}`}
            label=""
            confirmText={`Delete fixture "${fixture.title}"? This also deletes its cases.`}
          />
        </>
      }
    />
  );
}
