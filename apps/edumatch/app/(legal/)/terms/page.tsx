export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: May 2, 2026</p>
      
      <div className="prose max-w-none">
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">1. Acceptance</h2>
          <p>By using EduMatch, you agree to these Terms of Service.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">2. For Students</h2>
          <ul className="list-disc pl-6">
            <li>Submit accurate information about academic needs</li>
            <li>Pay for booked sessions promptly</li>
            <li>Respect tutor time and availability</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">3. For Tutors</h2>
          <ul className="list-disc pl-6">
            <li>Be at least 18 years old with verifiable expertise</li>
            <li>Complete Stripe Connect onboarding</li>
            <li>15% platform fee applies to all bookings</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">4. Contact</h2>
          <p>Questions: support@asafarim.com</p>
        </section>
      </div>
    </div>
  );
}
