"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface CollapsibleFormProps {
  buttonLabel: string;
  title: string;
  description: string;
  children: ReactNode | ((onSuccess: () => void) => ReactNode);
}

export function CollapsibleForm({ buttonLabel, title, description, children }: CollapsibleFormProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => setOpen(false);

  return (
    <div className="flex flex-col gap-4">
      {!open && (
        <Button onClick={() => setOpen(true)} className="self-start">
          <Plus className="h-4 w-4" />
          {buttonLabel}
        </Button>
      )}

      {open && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div className="flex flex-col gap-1.5">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close form">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {typeof children === "function" ? children(handleSuccess) : children}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
