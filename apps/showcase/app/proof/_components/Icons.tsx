/* Brand marks are single-path and inherit currentColor, so they follow the
   theme instead of pinning brand colours. npm mark from Simple Icons (CC0),
   GitHub mark from Primer Octicons (MIT). */

interface IconProps {
  size?: number;
}

export function NpmIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
    </svg>
  );
}

export function GitHubIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

export function ExternalIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5h4v4M13.5 2.5 7 9M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

export function DownloadIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
    </svg>
  );
}

export function CommitIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="8" r="2.75" />
      <path d="M1 8h4.25M10.75 8H15" strokeLinecap="round" />
    </svg>
  );
}
