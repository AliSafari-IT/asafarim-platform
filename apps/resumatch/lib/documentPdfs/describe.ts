import type { PdfStatus } from "./service";

/** The PDF summary the browser may see: never a storage key. */
export function describePdfStatus(status: PdfStatus) {
  const pdf = (state: PdfStatus["cv"] | null) =>
    state?.latest
      ? {
          id: state.latest.id,
          filename: state.latest.filename,
          byteSize: state.latest.byteSize,
          createdAt: state.latest.createdAt.toISOString(),
          current: state.current,
        }
      : null;
  return { cv: pdf(status.cv), letter: pdf(status.letter), hasCoverLetter: status.letter !== null, ready: status.ready };
}


export type PdfStatusView = ReturnType<typeof describePdfStatus>;
