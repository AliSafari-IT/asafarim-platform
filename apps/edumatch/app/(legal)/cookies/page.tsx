import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy | EduMatch',
  description: 'Information about how EduMatch uses cookies.',
};

export default function CookiePolicyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Cookie Policy</h1>
      
      <div className="prose prose-slate max-w-none">
        <p className="text-sm text-gray-500 mb-8">
          Last updated: May 2, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">1. What Are Cookies</h2>
          <p className="mb-4">
            Cookies are small text files that are placed on your computer or mobile device when you 
            visit a website. They are widely used to make websites work more efficiently and provide 
            information to the website owners.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">2. How We Use Cookies</h2>
          <p className="mb-4">
            EduMatch uses cookies for the following purposes:
          </p>
          
          <h3 className="text-lg font-medium mb-2">2.1 Essential Cookies</h3>
          <p className="mb-4">
            These cookies are necessary for the website to function properly. They enable core 
            functionality such as:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li>User authentication and session management</li>
            <li>Security features</li>
            <li>Remembering your preferences</li>
          </ul>

          <h3 className="text-lg font-medium mb-2">2.2 Analytics Cookies</h3>
          <p className="mb-4">
            We use PostHog to understand how visitors interact with our website:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li>Pages visited and time spent</li>
            <li>Feature usage patterns</li>
            <li>Error tracking</li>
          </ul>

          <h3 className="text-lg font-medium mb-2">2.3 Functional Cookies</h3>
          <p className="mb-4">
            These enable enhanced functionality:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li>Remembering your role selection (student/tutor)</li>
            <li>Language preferences</li>
            <li>Display preferences</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">3. Third-Party Cookies</h2>
          <p className="mb-4">
            Some cookies are placed by third-party services we use:
          </p>
          <table className="w-full mb-4 border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Service</th>
                <th className="text-left py-2">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2">PostHog</td>
                <td className="py-2">Analytics and product insights</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Sentry</td>
                <td className="py-2">Error tracking and performance monitoring</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Stripe</td>
                <td className="py-2">Payment processing and fraud prevention</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">4. Managing Cookies</h2>
          <p className="mb-4">
            You can control cookies through your browser settings:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li>
              <strong>Chrome:</strong> Settings → Privacy and security → Cookies
            </li>
            <li>
              <strong>Firefox:</strong> Settings → Privacy & Security → Cookies
            </li>
            <li>
              <strong>Safari:</strong> Preferences → Privacy → Cookies
            </li>
            <li>
              <strong>Edge:</strong> Settings → Cookies and site permissions
            </li>
          </ul>
          <p className="mb-4">
            Please note that disabling cookies may affect the functionality of our website.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">5. Contact Us</h2>
          <p>
            If you have questions about our use of cookies, please contact:
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
