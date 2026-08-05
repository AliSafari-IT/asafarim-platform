import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | EduMatch',
  description: 'Learn how EduMatch collects, uses, and protects your personal information.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="prose prose-slate max-w-none">
        <p className="text-sm text-gray-500 mb-8">
          Last updated: May 2, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
          <p className="mb-4">
            EduMatch (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
            when you use our platform.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>
          <h3 className="text-lg font-medium mb-2">2.1 Personal Information</h3>
          <ul className="list-disc pl-6 mb-4">
            <li>Name and email address</li>
            <li>Profile information (grade level, subjects of interest)</li>
            <li>Payment information (processed by Stripe)</li>
            <li>Location data (with your consent)</li>
          </ul>

          <h3 className="text-lg font-medium mb-2">2.2 Usage Information</h3>
          <ul className="list-disc pl-6 mb-4">
            <li>Inquiries and questions submitted</li>
            <li>Session history and bookings</li>
            <li>Device and browser information</li>
            <li>IP address and cookies</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 mb-4">
            <li>To provide and improve our services</li>
            <li>To match students with suitable tutors</li>
            <li>To process payments and payouts</li>
            <li>To send notifications and updates</li>
            <li>To analyze and improve platform performance</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">4. Third-Party Services</h2>
          <p className="mb-4">
            We use the following third-party services:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li><strong>Stripe</strong> — Payment processing</li>
            <li><strong>OpenAI</strong> — AI tutoring explanations</li>
            <li><strong>Resend</strong> — Email notifications</li>
            <li><strong>Supabase</strong> — Database and authentication</li>
            <li><strong>DigitalOcean</strong> — File storage</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">5. Your Rights (GDPR)</h2>
          <p className="mb-4">
            If you are in the European Union, you have the following rights:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li>Right to access your data</li>
            <li>Right to rectification</li>
            <li>Right to erasure (&ldquo;right to be forgotten&rdquo;)</li>
            <li>Right to restrict processing</li>
            <li>Right to data portability</li>
            <li>Right to object</li>
          </ul>
          <p>
            To exercise these rights, contact us at privacy@asafarim.com
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">6. Data Security</h2>
          <p className="mb-4">
            We implement appropriate technical and organizational measures to protect your data, 
            including encryption, access controls, and regular security audits.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">7. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at:
            <br />
            <a href="mailto:privacy@asafarim.com" className="text-blue-600 hover:underline">
              privacy@asafarim.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
