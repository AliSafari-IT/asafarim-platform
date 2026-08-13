import type { Metadata } from "next";
import { AboutThisProjectView } from "./AboutThisProjectView";

export const metadata: Metadata = {
  title: "Behind this project",
  description:
    "EduMatch is a working showcase project from ASafarIM Digital: a complete tutoring-marketplace architecture, deployed on production infrastructure, with no commercial marketplace behind it.",
};

export default function AboutThisProjectPage() {
  return <AboutThisProjectView />;
}
