"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";

export default function CreatePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isGuest = status !== "loading" && !session?.user;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">Create a timeline</h1>
      <TimelineEditor
        mode="create"
        isGuest={isGuest}
        onSaved={({ publicId }) => router.push(`/t/${publicId}`)}
      />
    </div>
  );
}
