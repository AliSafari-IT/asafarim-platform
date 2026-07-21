"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuiteForm } from "@/components/forms/suite-form";
import { DeleteButton } from "@/components/delete-button";
import { Pencil, X } from "lucide-react";

interface SuiteCardProps {
  suite: { suiteId: string; frId: string; title: string; description: string; fixtureCount: number };
  frTitle?: string;
  frOptions: { id: string; title: string }[];
}

export function SuiteCard({ suite, frTitle, frOptions }: SuiteCardProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <SuiteForm mode="edit" initial={suite} frOptions={frOptions} onSuccess={() => setEditing(false)} />
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
          <Link href={`/suites/${suite.suiteId}`} className="hover:underline">
            <CardTitle>{suite.title}</CardTitle>
          </Link>
          <Badge variant="outline">{suite.fixtureCount} fixture(s)</Badge>
        </div>
        <Link href={`/suites/${suite.suiteId}`}>
          <CardDescription>{suite.description}</CardDescription>
        </Link>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          FR: {frTitle ?? suite.frId} &middot; <code>{suite.suiteId}</code>
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <DeleteButton
            url={`/api/suites/${suite.suiteId}`}
            confirmText={`Delete suite "${suite.title}"? This also deletes its fixtures and cases.`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
