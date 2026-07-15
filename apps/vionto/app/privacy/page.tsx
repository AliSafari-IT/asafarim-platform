/**
 * Privacy Policy for Vionto
 */

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] px-5 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">Last updated: May 8, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
            <p>
              Vionto collects the following information to provide our AI-powered photo-to-story video service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account information:</strong> Name, email, username</li>
              <li><strong>Uploaded content:</strong> Images you upload for video creation</li>
              <li><strong>Imported content:</strong> Photos you choose to import from Google Photos (your library or shared albums)</li>
              <li><strong>Generated content:</strong> Scripts, audio tracks, and video exports</li>
              <li><strong>Usage data:</strong> Project counts, storage usage, render minutes</li>
              <li><strong>Technical data:</strong> IP address, browser type, device information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Google Photos Integration</h2>
            <p>
              If you choose to connect Google Photos, Vionto requests permission to read{" "}
              <strong>only the specific photos you select</strong> in Google&rsquo;s own photo
              picker (or from a shared album link you provide). We never receive blanket access
              to your Google Photos library.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Limited Use:</strong> Vionto&rsquo;s use of information received from
                Google APIs adheres to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. Photos you import are used solely to
                create the videos you request, and are not used for advertising or sold to
                third parties.
              </li>
              <li>
                <strong>Tokens:</strong> Your Google authorization tokens are stored encrypted at
                rest and are used only to fetch the photos you select.
              </li>
              <li>
                <strong>Revoking access:</strong> You can disconnect Google Photos at any time from
                the import panel, which revokes Vionto&rsquo;s access at Google and deletes the
                stored authorization. Disconnecting and deleting your account both remove these
                tokens. You can also revoke access at{" "}
                <a href="https://myaccount.google.com/permissions" className="underline" target="_blank" rel="noreferrer">
                  Google Account permissions
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, maintain, and improve Vionto services</li>
              <li>Process your images and generate videos using AI models</li>
              <li>Enforce quotas and billing for your plan</li>
              <li>Communicate with you about your account and projects</li>
              <li>Ensure security and prevent abuse of our platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. AI Content Generation</h2>
            <p>
              Vionto uses third-party AI providers (OpenAI, ElevenLabs) to generate narration scripts and audio tracks. 
              Your uploaded images may be processed by these providers to extract visual context for script generation. 
              We do not use your content to train or improve these AI models.
            </p>
            <p className="mt-2">
              <strong>Content Safety:</strong> We use content moderation tools to screen generated scripts for NSFW, violence, hate, and other prohibited content. Content flagged as unsafe will be blocked or flagged for review.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Storage and Retention</h2>
            <p>
              Your images, scripts, audio, and video exports are stored in secure object storage. 
              Retention depends on your plan and project settings:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Free plan:</strong> Projects auto-archive after 30 days of inactivity</li>
              <li><strong>Pro plan:</strong> Projects retained for 90 days, then auto-archive</li>
              <li><strong>Enterprise plan:</strong> Custom retention terms available</li>
              <li><strong>Hard delete:</strong> You may permanently delete projects at any time</li>
            </ul>
            <p className="mt-2">
              Archived projects may be restored within 7 days. After that, data is permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Sharing</h2>
            <p>We do not sell your personal data. We may share data with:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>AI providers:</strong> OpenAI and ElevenLabs for content generation (under data processing agreements)</li>
              <li><strong>Service providers:</strong> Cloud infrastructure, analytics, and support tools</li>
              <li><strong>Legal requirements:</strong> When required by law or to protect our rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access, download, or delete your account and data</li>
              <li>Correct inaccurate information</li>
              <li>Opt out of non-essential communications</li>
              <li>Export your projects in standard formats</li>
              <li>Request a copy of your personal data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Security</h2>
            <p>
              We implement industry-standard security measures including encryption at rest and in transit, 
              access controls, and regular security audits. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Children's Privacy</h2>
            <p>
              Vionto is not intended for users under 13. We do not knowingly collect personal information from children under 13. 
              If we become aware that we have collected such information, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of material changes by email or by posting a notice on our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
            <p>
              For questions about this privacy policy or your personal data, contact us at:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> privacy@asafarim.com<br />
              <strong>Address:</strong> ASafariM Digital, Amsterdam, Netherlands
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
