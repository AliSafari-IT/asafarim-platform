import { permanentRedirect } from "next/navigation";

// The changelog now lives in the "History" view of /roadmap.
export default function ChangelogPage() {
  permanentRedirect("/roadmap");
}
