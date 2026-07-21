import { Suspense } from "react";
import { RunPanel } from "./run-panel";
import { RunTour } from "@/components/run/run-tour";

export default function RunPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Run Tests</h1>
        <p className="text-muted-foreground">Execute a fixture on demand and view JSON results immediately.</p>
      </div>
      <Suspense>
        <RunPanel />
      </Suspense>
      <RunTour />
    </div>
  );
}
