/**
 * Content safety moderation API using OpenAI Moderation API
 * Checks text for NSFW, violence, hate, self-harm, sexual content
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@asafarim/auth";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const moderation = await openai.moderations.create({ input: text });
    const result = moderation.results[0];

    const flagged = result.flagged;
    const categories = result.categories;
    const categoryScores = result.category_scores;

    // Determine outcome
    let outcome: "ALLOW" | "REVIEW" | "REFUSE" = "ALLOW";
    let category: string | null = null;
    let reason: string | null = null;

    if (categories.sexual || categories.violence || categories["self-harm"]) {
      outcome = "REFUSE";
      category = categories.sexual ? "NSFW" : categories.violence ? "VIOLENCE" : "SELF_HARM";
      reason = "Content violates safety policies";
    } else if (categories.hate || categories.harassment) {
      outcome = "REFUSE";
      category = categories.hate ? "HATE" : "HARASSMENT";
      reason = "Content violates safety policies";
    } else if (flagged) {
      outcome = "REVIEW";
      category = "OTHER";
      reason = "Content flagged for review";
    }

    return NextResponse.json({
      outcome,
      category,
      reason,
      flagged,
      categories,
      categoryScores,
    });
  } catch (error) {
    console.error("Moderation error:", error);
    return NextResponse.json(
      { error: "Moderation service unavailable" },
      { status: 500 }
    );
  }
}
