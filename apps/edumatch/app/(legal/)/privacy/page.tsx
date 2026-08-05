export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: May 2, 2026</p>
      
      <div className="prose max-w-none">
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
          <p>EduMatch is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>
          <ul className="list-disc pl-6">
            <li>Name and email address</li>
            <li>Profile information (grade level, subjects)</li>
            <li>Payment information (processed by Stripe)</li>
            <li>Location data (with consent)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">3. Third-Party Services</h2>
          <ul className="list-disc pl-6">
            <li>Stripe — Payment processing</li>
            <li>OpenAI — AI explanations</li>
            <li>Resend — Email notifications</li>
            <li>Supabase — Database and auth</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">4. Your Rights (GDPR)</h2>
          <p>You have the right to access, rectify, erase, and port your data. Contact: privacy@asafarim.com</p>
        </section>
      </div>
    </div>
  );
}
