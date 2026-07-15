/**
 * Audio normalization and ducking utilities.
 *
 * These helpers build FFmpeg filtergraph strings for:
 *   - Loudness normalization (ebu-r128 or simple peak)
 *   - Ducking background music under narration
 *   - Fade-in / fade-out envelopes
 *
 * They are pure string builders — the worker shell-out runs FFmpeg.
 */

export type MixFilterOptions = {
  /** Index of the narration stream (default 0). */
  narrationIndex?: number;
  /** Index of the music stream (default 1). */
  musicIndex?: number;
  /** Target integrated loudness in LUFS (EBU R128). */
  targetLoudness?: number;
  /** Duck gain multiplier for music when narration is active (0..1). */
  duckGain?: number;
  /** Attack time for ducking in milliseconds. */
  duckAttackMs?: number;
  /** Release time for ducking in milliseconds. */
  duckReleaseMs?: number;
  /** Fade-in duration in seconds. */
  fadeInSeconds?: number;
  /** Fade-out duration in seconds. */
  fadeOutSeconds?: number;
};

/**
 * Build an FFmpeg filter_complex string that mixes narration and background
 * music with EBU R128 loudness normalization and side-chain ducking.
 *
 * Assumes two input audio streams.
 */
export function buildAudioMixFilter(opts: MixFilterOptions = {}): string {
  const {
    narrationIndex = 0,
    musicIndex = 1,
    targetLoudness = -16,
    duckGain = 0.15,
    duckAttackMs = 50,
    duckReleaseMs = 300,
    fadeInSeconds = 0,
    fadeOutSeconds = 0,
  } = opts;

  const narr = `[${narrationIndex}:a]`;
  const music = `[${musicIndex}:a]`;

  const parts: string[] = [];

  // Normalize narration
  parts.push(`${narr}aloudn=I=${targetLoudness}:TP=-1.5:LRA=11[norm_narr];`);

  // Normalize music
  parts.push(`${music}aloudn=I=${targetLoudness}:TP=-1.5:LRA=11[norm_music];`);

  // Side-chain ducking: music volume is reduced when narration is loud
  parts.push(
    `[norm_narr][norm_music]sidechaincompress=threshold=-30dB:ratio=10:attack=${duckAttackMs}:release=${duckReleaseMs}:level_sc=1[ducked_music];`
  );

  // Apply duck gain to music
  parts.push(`[ducked_music]avolume=volume=${duckGain}[music_ducked];`);

  // Mix narration + ducked music
  parts.push(`[norm_narr][music_ducked]amix=inputs=2:duration=first:dropout_transition=3[mixed];`);

  // Fade in / fade out
  const fadeParts: string[] = [];
  if (fadeInSeconds > 0) fadeParts.push(`afade=t=in:ss=0:d=${fadeInSeconds}`);
  if (fadeOutSeconds > 0) fadeParts.push(`afade=t=out:st=0:d=${fadeOutSeconds}`);
  if (fadeParts.length > 0) {
    parts.push(`[mixed]${fadeParts.join(",")}[final];`);
  } else {
    parts.push(`[mixed]afifo[final];`);
  }

  return parts.join("");
}

/**
 * Build a simpler FFmpeg audio filter when only narration exists (no music).
 */
export function buildNarrationOnlyFilter(opts: { targetLoudness?: number; fadeInSeconds?: number; fadeOutSeconds?: number } = {}): string {
  const { targetLoudness = -16, fadeInSeconds = 0, fadeOutSeconds = 0 } = opts;
  const parts = [`aloudn=I=${targetLoudness}:TP=-1.5:LRA=11`];
  if (fadeInSeconds > 0) parts.push(`afade=t=in:ss=0:d=${fadeInSeconds}`);
  if (fadeOutSeconds > 0) parts.push(`afade=t=out:st=0:d=${fadeOutSeconds}`);
  return parts.join(",");
}

/**
 * Estimate total audio duration from the narration text at a given WPM.
 */
export function estimateDurationFromText(text: string, wpm = 150): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil((words / wpm) * 60);
}
