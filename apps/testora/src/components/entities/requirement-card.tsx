"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequirementForm } from "@/components/forms/requirement-form";
import { DeleteButton } from "@/components/delete-button";
import { Pencil, X } from "lucide-react";

interface RequirementCardProps {
  fr: { id: string; title: string; description: string; suiteCount: number; baseUrl?: string | null };
}

export function RequirementCard({ fr }: RequirementCardProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <RequirementForm mode="edit" initial={fr} onSuccess={() => setEditing(false)} />
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
          <Link href={`/requirements/${fr.id}`} className="hover:underline">
            <CardTitle>{fr.title}</CardTitle>
          </Link>
          <Badge variant="outline">{fr.suiteCount} suite(s)</Badge>
        </div>
        <Link href={`/requirements/${fr.id}`}>
          <CardDescription>{fr.description}</CardDescription>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <code className="text-xs text-muted-foreground">{fr.id}</code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <DeleteButton
              url={`/api/requirements/${fr.id}`}
              confirmText={`Delete requirement "${fr.title}"? This also deletes its suites, fixtures and cases.`}
            />
          </div>
        </div>
        {fr.baseUrl && (
          <p className="text-xs text-muted-foreground">
            Base URL: <code>{fr.baseUrl}</code>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
