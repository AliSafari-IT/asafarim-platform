"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FixtureForm } from "@/components/forms/fixture-form";
import { DeleteButton } from "@/components/delete-button";
import { Pencil, X } from "lucide-react";

interface FixtureCardProps {
  fixture: {
    fixtureId: string;
    suiteId: string;
    title: string;
    baseUrl?: string | null;
    commonInput: Record<string, unknown>;
    caseCount: number;
  };
  suiteTitle?: string;
  suiteOptions: { suiteId: string; title: string }[];
}

export function FixtureCard({ fixture, suiteTitle, suiteOptions }: FixtureCardProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <FixtureForm mode="edit" initial={fixture} suiteOptions={suiteOptions} onSuccess={() => setEditing(false)} />
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-colors hover:border-primary/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <Link href={`/fixtures/${fixture.fixtureId}`} className="hover:underline">
            <CardTitle>{fixture.title}</CardTitle>
          </Link>
          <Badge variant="outline">{fixture.caseCount} case(s)</Badge>
        </div>
        <CardDescription>Suite: {suiteTitle ?? fixture.suiteId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(fixture.commonInput, null, 2)}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/fixtures/${fixture.fixtureId}`}>View / add cases</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/run?fixtureId=${fixture.fixtureId}`}>Run this fixture</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <DeleteButton
            url={`/api/fixtures/${fixture.fixtureId}`}
            confirmText={`Delete fixture "${fixture.title}"? This also deletes its cases.`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
