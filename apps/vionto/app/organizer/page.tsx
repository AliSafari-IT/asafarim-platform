import type { Metadata } from "next";
import { OrganizerPageClient } from "./OrganizerPageClient";

export const metadata: Metadata = {
  title: "Image Organizer",
  description: "Browse, edit, and organize your uploaded images with a full-featured lightbox viewer.",
};

export default function OrganizerPage() {
  return <OrganizerPageClient />;
}
