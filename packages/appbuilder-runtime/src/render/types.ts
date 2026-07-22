/**
 * Structured render failure. Never thrown past the renderer boundary — the
 * top-level `renderPreview` always returns a `RenderResult`, so a caller
 * (the Next.js preview route) can render an actionable diagnostic instead of
 * a raw stack trace, per M06's "reject, don't silently omit" contract.
 */
export interface RenderError {
  code:
    | "unknown_page"
    | "malformed_specification"
    | "unknown_component_kind"
    | "unknown_variant"
    | "invalid_config"
    | "invalid_binding"
    | "unsafe_url"
    | "render_depth_exceeded"
    | "render_count_exceeded"
    | "cyclic_reference";
  message: string;
  /** Path to the offending node within the specification, when known. */
  path?: (string | number)[];
}

export interface RenderErrorResult {
  ok: false;
  errors: RenderError[];
}
