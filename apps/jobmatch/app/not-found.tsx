import Link from "next/link";
import { PageHeader } from "@asafarim/ui";

export default function NotFound() {
  return (
    <>
      <PageHeader kicker="404" title="That page does not exist." />
      <p className="jm-note">
        <Link href="/" className="jm-mono">
          Back to the overview →
        </Link>
      </p>
    </>
  );
}
