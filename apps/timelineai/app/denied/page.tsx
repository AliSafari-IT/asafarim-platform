export default function DeniedPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="mb-3 text-2xl font-bold">You don't have access to this page</h1>
      <p className="text-[var(--color-text-muted,inherit)]">
        This area is restricted to administrators. If you think this is a mistake, contact an admin.
      </p>
    </div>
  );
}
