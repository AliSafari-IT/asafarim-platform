import { NextResponse } from "next/server";
import { experiments } from "../../../lib/experiments/registry";

export async function GET() {
  const activeCount = experiments.filter((e) => e.status === "active" || e.status === "beta").length;

  return NextResponse.json({
    status: "ok",
    runtime: "node",
    activeExperiments: activeCount,
    totalExperiments: experiments.length,
  });
}
