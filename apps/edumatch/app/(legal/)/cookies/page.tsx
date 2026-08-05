export default function CookiesPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Cookie Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: May 2, 2026</p>
      
      <div className="prose max-w-none">
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">1. Essential Cookies</h2>
          <p>Used for authentication, session management, and security.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">2. Analytics Cookies</h2>
          <p>We use PostHog to understand platform usage and improve our service.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">3. Third-Party Cookies</h2>
          <ul className="list-disc pl-6">
            <li>PostHog — Analytics</li>
            <li>Sentry — Error tracking</li>
            <li>Stripe — Payment processing</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
