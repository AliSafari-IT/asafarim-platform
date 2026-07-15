/**
 * Acceptable Use Policy for Vionto
 */

export default function AcceptableUsePage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] px-5 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold mb-6">Acceptable Use Policy</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">Last updated: May 8, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">Overview</h2>
            <p>
              This Acceptable Use Policy ("AUP") outlines the prohibited uses of Vionto, our AI-powered photo-to-story video service. 
              By using Vionto, you agree to comply with this policy. Violations may result in account suspension or termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Prohibited Content</h2>
            <p>You may not use Vionto to create or share content that:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Depicts sexual violence or non-consensual sexual content</strong></li>
              <li><strong>Promotes or depicts child sexual abuse material (CSAM)</strong></li>
              <li><strong>Contains gratuitous violence, gore, or torture</strong></li>
              <li><strong>Promotes self-harm, suicide, or eating disorders</strong></li>
              <li><strong>Advocates hate speech, discrimination, or harassment</strong> based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics</li>
              <li><strong>Encourages illegal activities</strong> including drug use, fraud, or violence</li>
              <li><strong>Contains misinformation</strong> that could cause public harm (e.g., health misinformation, election interference)</li>
              <li><strong>Infringes intellectual property rights</strong> of third parties</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Deepfakes and Synthetic Media</h2>
            <p>
              Vionto is designed for personal storytelling, not for creating deceptive synthetic media. 
              You may not use Vionto to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Create deepfakes that depict real people without their consent</li>
              <li>Generate content that could be mistaken for authentic footage of real events</li>
              <li>Impersonate public figures, celebrities, or private individuals</li>
              <li>Create political disinformation or propaganda</li>
            </ul>
            <p className="mt-2">
              <strong>Note:</strong> Vionto maintains provenance logs for all generated content. 
              We may disclose these logs to law enforcement or in response to legal requests.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Harassment and Abuse</h2>
            <p>You may not use Vionto to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Harass, bully, or threaten individuals</li>
              <li>Create content intended to intimidate or humiliate others</li>
              <li>Dox or reveal private information about individuals without consent</li>
              <li>Engage in stalking or unwanted surveillance</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Commercial and Political Use</h2>
            <p>
              <strong>Commercial use:</strong> Free and Pro plans are for personal use only. Commercial use requires an Enterprise plan with explicit authorization.
            </p>
            <p className="mt-2">
              <strong>Political use:</strong> You may not use Vionto to create political advertisements, campaign materials, or election-related content without prior written approval.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Technical Abuse</h2>
            <p>You may not:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Attempt to reverse-engineer, decompile, or extract our AI models or algorithms</li>
              <li>Use automated tools to abuse our APIs or quotas</li>
              <li>Attempt to bypass security measures or access controls</li>
              <li>Probe, scan, or test our systems for vulnerabilities</li>
              <li>Introduce malware, viruses, or other harmful code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Content Moderation and Enforcement</h2>
            <p>
              We use automated content moderation tools (OpenAI Moderation API) to screen generated content. 
              Content flagged as prohibited will be blocked or flagged for human review.
            </p>
            <p className="mt-2">
              <strong>Enforcement actions:</strong> Violations of this policy may result in:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Content removal or blocking</li>
              <li>Account warning</li>
              <li>Temporary account suspension</li>
              <li>Permanent account termination</li>
              <li>Reporting to law enforcement (for illegal content)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Reporting Violations</h2>
            <p>
              If you encounter content that violates this policy, please report it to us at:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> abuse@asafarim.com
            </p>
            <p className="mt-2">
              Please include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Description of the violation</li>
              <li>Link to the content (if available)</li>
              <li>Your contact information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this policy at any time. Material changes will be notified by email or posted on our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Questions</h2>
            <p>
              For questions about this policy, contact us at:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> legal@asafarim.com
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
