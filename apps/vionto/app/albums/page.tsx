import type { Metadata } from "next";
import { ViontoNav } from "@/components/ViontoNav";
import { AlbumDashboardClient } from "./AlbumDashboardClient";

export const metadata: Metadata = {
  title: "Album Dashboard - Vionto",
  description: "Overview of your albums, renders, and video exports.",
};

export default function AlbumsPage() {
  return (
    <>
      <ViontoNav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <AlbumDashboardClient />
      </main>
    </>
  );
}
