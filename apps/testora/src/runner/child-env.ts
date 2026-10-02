/**
 * The env a job's child process starts with (#717, ADR 0004 §3): the job
 * envelope's env plus the few OS variables Node and the browser need on this
 * platform — nothing else from the runner (its token and signing secret
 * included). Pure, so it can be unit-tested.
 */

/**
 * Runner-side variables a child may inherit. On Linux (the runner container,
 * #718) only the essentials: PATH, HOME, TMPDIR and the locale. Windows dev
 * (`worker:dev`) needs its system paths for Node and Chrome to start.
 */
export function osEnvAllowlist(platform: NodeJS.Platform): readonly string[] {
  if (platform === "win32") {
    return [
      "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "ComSpec",
      "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA",
      "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles",
      "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
    ];
  }
  return ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];
}

/** Envelope env first; an allowlisted OS variable only fills a gap. */
export function buildChildEnv(
  envelopeEnv: Record<string, string>,
  runnerEnv: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): Record<string, string> {
  const env: Record<string, string> = { ...envelopeEnv };
  for (const name of osEnvAllowlist(platform)) {
    const value = runnerEnv[name];
    if (value !== undefined && !(name in env)) env[name] = value;
  }
  return env;
}
