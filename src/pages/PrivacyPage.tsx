import { PageHeader } from "../components/Primitives";
import "./PrivacyPage.css";

export function PrivacyPage() {
  return <div className="privacy-page">
    <PageHeader meta="Privacy · Updated 26 September 2026" title="Your information, handled with care." description="How Armature AI Labs handles website visits and enquiries, and what we are preparing for membership." />
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
        <p>Please do not send government ID copies or other sensitive documents by ordinary email. Online membership applications and government ID uploads are not open on this public website yet.</p>
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
        <h2 id="privacy-membership">Membership: planned, not open yet</h2>
        <p>Before we open online applications, we will provide a notice at registration explaining the data requested and its use. The planned process includes your name, contact details, date of birth, LinkedIn URL, photo and one accepted government ID for identity and age review.</p>
        <p>The planned minimum age is 16. Applicants aged 16–17 will need a guardian’s permission sent directly to the lab by email and reviewed by staff. Overnight access will be restricted to adults aged 18 or above.</p>
        <p>We are preparing private document storage in Supabase with access limited to the applicant and authorised reviewers. The planned retention period for uploaded ID copies is 30 days from upload, including applications still under review. A limited verification record will remain separately.</p>
        <p>These are planned safeguards, not an invitation to upload documents now. The launch notice will explain retention for other records and backup handling. The 30-day plan does not mean every provider backup or separately retained record is erased on that date.</p>
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
