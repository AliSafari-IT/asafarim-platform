export default function Loading() {
  return (
    <div role="status" aria-live="polite" style={{ padding: "3rem 0", opacity: 0.7 }}>
      <p className="jm-mono">Loading JobMatch…</p>
    </div>
  );
}
