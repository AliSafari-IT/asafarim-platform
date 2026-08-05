import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | EduMatch',
  description: 'Terms and conditions for using the EduMatch platform.',
};

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      
      <div className="prose prose-slate max-w-none">
        <p className="text-sm text-gray-500 mb-8">
          Last updated: May 2, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
          <p className="mb-4">
            By accessing or using EduMatch, you agree to be bound by these Terms of Service. 
            If you disagree with any part of the terms, you may not access the service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
          <p className="mb-4">
            EduMatch is an educational platform that connects students seeking academic help 
            with qualified tutors. We provide:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li>AI-powered explanations and study plans</li>
            <li>Student-tutor matching services</li>
            <li>Booking and payment processing</li>
            <li>In-app messaging and notifications</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">3. User Accounts</h2>
          <p className="mb-4">
            When you create an account with us, you must provide accurate and complete information. 
            You are responsible for safeguarding the password and for all activities under your account.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">4. For Students</h2>
          <h3 className="text-lg font-medium mb-2">4.1 Service Usage</h3>
          <ul className="list-disc pl-6 mb-4">
            <li>Submit truthful and accurate information about your academic needs</li>
            <li>Respect tutor time and availability</li>
            <li>Pay for booked sessions promptly</li>
            <li>Provide honest feedback after sessions</li>
          </ul>

          <h3 className="text-lg font-medium mb-2">4.2 Payments</h3>
          <p className="mb-4">
            All payments are processed through Stripe. EduMatch charges a 15% platform fee on all 
            tutor bookings. Refunds are handled on a case-by-case basis.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">5. For Tutors</h2>
          <h3 className="text-lg font-medium mb-2">5.1 Eligibility</h3>
          <p className="mb-4">
            To become a tutor, you must:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li>Be at least 18 years old</li>
            <li>Have verifiable expertise in subjects you teach</li>
            <li>Complete Stripe Connect onboarding for payouts</li>
            <li>Maintain a professional demeanor</li>
          </ul>

          <h3 className="text-lg font-medium mb-2">5.2 Payouts</h3>
          <p className="mb-4">
            Tutors receive payment minus the 15% platform fee. Payouts are processed to your 
            connected bank account within 1-2 business days after requesting a payout. Minimum 
            payout threshold is €50.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">6. Prohibited Activities</h2>
          <ul className="list-disc pl-6 mb-4">
            <li>Sharing personal contact information outside the platform</li>
            <li>Arranging payments outside the platform</li>
            <li>Harassment or inappropriate behavior</li>
            <li>Plagiarism or academic dishonesty</li>
            <li>Impersonating others</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">7. Termination</h2>
          <p className="mb-4">
            We may terminate or suspend your account immediately, without prior notice or liability, 
            for any reason, including breach of these Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">8. Limitation of Liability</h2>
          <p className="mb-4">
            EduMatch is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable 
            for the quality of tutoring services provided by independent tutors on our platform.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">9. Changes to Terms</h2>
          <p className="mb-4">
            We reserve the right to modify these terms at any time. We will notify users of any 
            changes by posting the new Terms on this page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">10. Contact Us</h2>
          <p>
            Questions about the Terms of Service should be sent to:
            <br />
            <a href="mailto:support@asafarim.com" className="text-blue-600 hover:underline">
              support@asafarim.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
