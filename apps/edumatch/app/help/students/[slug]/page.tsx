"use client";

import { useParams } from "next/navigation";
import { HelpArticleView } from "@/components/help/HelpArticleView";

export default function HelpStudentArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  return <HelpArticleView audience="student" slug={slug} />;
}
