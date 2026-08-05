"use client";

import { useParams } from "next/navigation";
import { HelpArticleView } from "@/components/help/HelpArticleView";

export default function HelpTutorArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  return <HelpArticleView audience="tutor" slug={slug} />;
}
