/**
 * SRT (SubRip Subtitle) generation and validation utilities.
 *
 * SRT format:
 *   1
 *   00:00:01,000 --> 00:00:04,000
 *   First line of text.
 *
 *   2
 *   00:00:05,000 --> 00:00:07,000
 *   Second line.
 */

export type SrtCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

function msToSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = Math.floor(ms % 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, "0")}`;
}

/** Build a single SRT cue block. */
export function formatSrtCue(cue: SrtCue): string {
  const start = msToSrtTime(cue.startMs);
  const end = msToSrtTime(cue.endMs);
  return `${cue.index}\n${start} --> ${end}\n${cue.text}`;
}

/** Build a full SRT string from cues. */
export function buildSrt(cues: SrtCue[]): string {
  return cues.map(formatSrtCue).join("\n\n") + "\n";
}

/** Parse a simple SRT string back into cues ( tolerant of whitespace ). */
export function parseSrt(input: string): SrtCue[] {
  const cues: SrtCue[] = [];
  const blocks = input.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.trim().split("\n").filter(Boolean);
    if (lines.length < 2) continue;
    const idx = Number(lines[0]);
    if (!Number.isFinite(idx)) continue;
    const timeLine = lines[1];
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!match) continue;
    const text = lines.slice(2).join("\n");
    cues.push({
      index: idx,
      startMs: srtTimeToMs(match[1]),
      endMs: srtTimeToMs(match[2]),
      text,
    });
  }
  return cues;
}

function srtTimeToMs(t: string): number {
  const [h, m, sMs] = t.split(":");
  const [s, ms] = sMs.split(",");
  return (
    Number(h) * 3_600_000 +
    Number(m) * 60_000 +
    Number(s) * 1000 +
    Number(ms)
  );
}

export type SubtitleTimingOptions = {
  maxCharsPerSegment?: number;
  minDisplayMs?: number;
  maxDisplayMs?: number;
  gapMs?: number;
  splitOnPunctuation?: boolean;
  splitLongSentences?: boolean;
};

/**
 * Generate evenly-timed SRT cues from a paragraph of text.
 *
 * Splits by sentence (naive: period / exclamation / question).
 * Each sentence gets a cue proportional to its word count.
 */
export function generateSrtFromText(
  text: string,
  startOffsetMs: number = 0,
  totalDurationMs: number = 30_000,
  timing?: SubtitleTimingOptions
): SrtCue[] {
  const maxChars = timing?.maxCharsPerSegment ?? 80;
  const minDisplay = timing?.minDisplayMs ?? 1200;
  const maxDisplay = timing?.maxDisplayMs ?? 7000;
  const gap = timing?.gapMs ?? 100;
  const splitOnPunctuation = timing?.splitOnPunctuation ?? true;
  const splitLong = timing?.splitLongSentences ?? true;

  let sentences: string[];
  if (splitOnPunctuation) {
    sentences = text
      .replace(/([.!?;:])\s+/g, "$1\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    sentences = [text.trim()].filter(Boolean);
  }

  if (sentences.length === 0) return [];

  const segments: string[] = [];
  for (const sentence of sentences) {
    if (splitLong && sentence.length > maxChars) {
      const words = sentence.split(/\s+/);
      let current = "";
      for (const word of words) {
        if (current && (current + " " + word).length > maxChars) {
          segments.push(current);
          current = word;
        } else {
          current = current ? current + " " + word : word;
        }
      }
      if (current) segments.push(current);
    } else {
      segments.push(sentence);
    }
  }

  const wordCounts = segments.map((s) => s.split(/\s+/).length);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);

  const cues: SrtCue[] = [];
  let cursorMs = startOffsetMs;

  for (let i = 0; i < segments.length; i++) {
    const ratio = totalWords === 0 ? 1 / segments.length : wordCounts[i] / totalWords;
    let durationMs = Math.round(totalDurationMs * ratio);
    durationMs = Math.max(minDisplay, Math.min(maxDisplay, durationMs));
    const endMs = cursorMs + durationMs;
    cues.push({
      index: i + 1,
      startMs: cursorMs,
      endMs,
      text: segments[i],
    });
    cursorMs = endMs + gap;
  }

  return cues;
}

/** Validate that a string looks like valid SRT (at least one cue, well-formed timing). */
export function isValidSrt(input: string): boolean {
  const cues = parseSrt(input);
  if (cues.length === 0) return false;
  for (const cue of cues) {
    if (cue.startMs < 0 || cue.endMs < 0) return false;
    if (cue.endMs <= cue.startMs) return false;
    if (!cue.text.trim()) return false;
  }
  return true;
}

// ─── VTT Export ─────────────────────────────────────────────────

function msToVttTime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = Math.floor(ms % 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${String(millis).padStart(3, "0")}`;
}

export function buildVtt(cues: SrtCue[]): string {
  const lines = ["WEBVTT", ""];
  for (const cue of cues) {
    lines.push(`${cue.index}`);
    lines.push(`${msToVttTime(cue.startMs)} --> ${msToVttTime(cue.endMs)}`);
    lines.push(cue.text);
    lines.push("");
  }
  return lines.join("\n");
}

export function srtToVtt(srtText: string): string {
  return buildVtt(parseSrt(srtText));
}

// ─── Text Transform ─────────────────────────────────────────────

export type TextTransform = "preserve" | "uppercase" | "lowercase" | "sentence";

export function applyTextTransform(text: string, transform: TextTransform): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "sentence":
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    default:
      return text;
  }
}

export function applyTransformToCues(cues: SrtCue[], transform: TextTransform): SrtCue[] {
  if (transform === "preserve") return cues;
  return cues.map((cue) => ({ ...cue, text: applyTextTransform(cue.text, transform) }));
}

// ─── Line Wrapping ──────────────────────────────────────────────

export function wrapCueText(text: string, maxLineWidth: number, maxLines: number): string {
  if (text.length <= maxLineWidth) return text;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxLineWidth) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  else if (current && lines.length >= maxLines) {
    lines[lines.length - 1] += " " + current;
  }
  return lines.join("\n");
}

export function wrapAllCues(cues: SrtCue[], maxLineWidth: number, maxLines: number): SrtCue[] {
  return cues.map((cue) => ({ ...cue, text: wrapCueText(cue.text, maxLineWidth, maxLines) }));
}
