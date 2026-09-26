import { basicOnboardingAvailable } from "../config/release";
import { PageHeader } from "../components/Primitives";
import "./PrivacyPage.css";

export function PrivacyPage() {
  return <div className="privacy-page">
    <PageHeader meta="Privacy · Updated 26 September 2026" title="Your information, handled with care." description="How Armature AI Labs handles website visits, enquiries and free membership registration." />
    <div className="wrap privacy-content">
      <section aria-labelledby="privacy-operator">
        <h2 id="privacy-operator">Who is responsible</h2>
        <p>Armature AI Labs is operated by Jayasri Nageshwara Rao and Partners LLP. This notice covers armatureailabs.com and enquiries sent to our lab.</p>
        <p>For privacy questions or requests, email <a href="mailto:privacy@armatureailabs.com">privacy@armatureailabs.com</a>. Our lab contact address is 1490, 11th Cross, 20th Main, 1st Sector, HSR Layout, Bengaluru – 560034, Karnataka.</p>
      </section>
      <section aria-labelledby="privacy-current">
        <h2 id="privacy-current">When you visit or contact us</h2>
        <p>You can browse our public pages without applying for membership. When you contact us, we receive the name, email address and other information you choose to include. We use it to respond, discuss your enquiry and keep the related correspondence.</p>
        <p>Our hosting and service providers process technical information needed to deliver and protect their services, such as IP addresses, browser information and request logs. We use Cloudflare for website delivery and Google Workspace for lab email. Relevant lab staff can access enquiries to handle them.</p>
        <p>Please do not send government ID copies or other sensitive documents by ordinary email. Use the protected registration portal when applications are available.</p>
      </section>
      <section aria-labelledby="privacy-browser">
        <h2 id="privacy-browser">Browser storage and external content</h2>
        <ul>
          <li>Your selected reading theme is saved in your browser. The website’s service worker may cache its interface and assets so pages can load again. You can clear this through your browser’s site-data settings.</li>
          <li>Our journal may load a video thumbnail from YouTube before you press play. The embedded YouTube player loads only when you press play and uses YouTube’s privacy-enhanced domain.</li>
          <li>The ecosystem map loads map styles and tiles from OpenFreeMap. These requests, like requests for external images, share connection information with the provider.</li>
          <li>Following links to services such as Discord, LinkedIn or GitHub takes you to websites governed by their own privacy notices.</li>
        </ul>
        <p>Third-party content and services may use their own storage and processing practices. Their privacy notices apply alongside this one when you use them.</p>
      </section>
      <section aria-labelledby="privacy-membership">
        <h2 id="privacy-membership">Basic membership and identity review</h2>
        <p>{basicOnboardingAvailable ? <>Free basic registration is available through our <a href="/onboarding">protected membership portal</a>.</> : "Online applications remain closed while we complete release checks. This notice describes the registration process prepared for launch."} Basic approval verifies your registration; it does not purchase or activate coworking, equipment, cabins or other paid access.</p>
        <p>You can sign in with a secure email link or Google. Supabase manages website accounts and sessions; Resend delivers authentication emails. Google sign-in shares basic account information such as your name, email and profile picture, without giving the lab access to your Gmail messages or Calendar. A sign-in session is stored in your browser so you can return to your application. Sign out on shared devices.</p>
        <p>We request your name, verified email, phone number, date of birth, personal LinkedIn URL, photo and one government ID: PAN card, Aadhaar card or passport. We use these for identity and age review, application corrections and membership administration. Your application and documents are private to you and authorised admin reviewers; submitting them does not create a public member profile.</p>
        <p>The minimum age is 16. For applicants aged 16–17, a guardian must email <a href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a> with the member’s name and registered email, the guardian’s name and relationship, and explicit permission. Staff review the actual email before approving the application and record its reference. Overnight access is for adults aged 18 or above and requires a separate paid entitlement when offered.</p>
        <p>Photos and ID images pass through a private Google Cloud malware and image-validation service before being stored in a private Supabase bucket. Documents are viewed through the protected portal. Staff must not download, screenshot or retain copies. A scanner failure prevents the upload from being accepted.</p>
        <p>Access to uploaded photo and ID copies ends 30 days after upload, even if review is still pending. Scheduled cleanup deletes expired copies; failures are monitored and retried. Correction requests expire previous copies earlier and require fresh uploads. Verification results remain after the images are deleted.</p>
        <p>We retain registration details, notice-acceptance history, review decisions and necessary correction or guardian-permission references to administer membership and respond to disputes or requests. These records do not contain a retained copy of your ID image. They do not currently have an automatic deletion deadline. Guardian permission emails remain in our Google Workspace mailbox and are not covered by the 30-day upload cleanup. Contact us to request review or deletion of these records; we will explain what needs to remain and why.</p>
        <p>Supabase database backups contain database records and Storage metadata, not the uploaded Storage image files. Deleting an uploaded image does not erase related database history or every provider log or backup. Restored records must be checked against expired or deleted uploads before document access is restored.</p>
        <p>Registration notice version: <strong>2026-09-26-release-1</strong>. We record your explicit acceptance with the application revision and server timestamp. Corrections require a new acceptance; previous acceptance records are retained.</p>
      </section>
      <section aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">Retention, providers and your choices</h2>
        <p>We keep enquiry correspondence while it is needed to respond and maintain the related relationship, or to meet applicable obligations and resolve disputes. Service-provider logs and backups follow their own retention arrangements. Depending on the provider, processing may take place outside India.</p>
        <p>You can ask us to explain the information we hold about you, correct it, delete it, or stop using it for an enquiry. Contact <a href="mailto:privacy@armatureailabs.com">privacy@armatureailabs.com</a> with enough context to identify your request. We may need to verify who is making the request and will explain any information we need to retain and why.</p>
        <p>If you have a concern about how we handled your information or request, use the same address to raise it with the lab. We will review it and respond.</p>
      </section>
      <section aria-labelledby="privacy-updates">
        <h2 id="privacy-updates">Changes to this notice</h2>
        <p>We will update this page when our services or data practices change. The date above shows the latest revision. New membership, payment or booking features will be accompanied by the relevant information before you use them.</p>
      </section>
    </div>
  </div>;
}
