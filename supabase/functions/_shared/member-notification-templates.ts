const portal = "https://armatureailabs.com/onboarding";
const help = "hello@armatureailabs.com";
const ready = `We have received the required registration details and scanned uploads for this submission. An authorised reviewer will review your application. Check its current status at ${portal}. Basic membership approval does not include paid access. If you are 16 or 17, your guardian must email ${help} with your name and registered email, their name and relationship, and explicit permission before approval.`;
const messages: Record<string, [string, string]> = {
  registration_saved: ["Your Armature registration is saved", `Your registration details have been saved. Open ${portal} to check any remaining steps, including your photo and government ID uploads. Please upload documents only through the website.`],
  ready: ["Your Armature application is ready for review", ready],
  resubmission_ready: ["Your Armature application is ready for review", ready],
  admin_ready: ["An Armature application is ready for review", "An application is ready for review. Open https://armatureailabs.com/admin/members and sign in with your authorised reviewer account. Review identity documents only inside the protected portal. Do not download or retain copies."],
  corrections_requested: ["An update about your Armature registration", `Your reviewer has requested changes to your application. Sign in at ${portal} to read the instructions and resubmit. Please keep identity documents inside the protected upload form rather than sending them by email.`],
  approved: ["An update about your Armature membership", `Your free basic membership has been approved. Sign in at ${portal} to view your membership and profile. Paid coworking, cabins, equipment bookings and payments remain closed for now; basic approval does not grant those services.`],
  rejected: ["An update about your Armature registration", `A decision is available on your registration. Sign in at ${portal} to see your current status and the member-facing explanation. Contact ${help} if you need help understanding the next step.`],
  revoked: ["An update about your Armature membership", `Your basic membership has been revoked. You can still sign in at ${portal} to view your status and the explanation. Member-community privileges are unavailable while membership is revoked. Contact ${help} if you need help.`],
  reinstated: ["An update about your Armature membership", `Your basic membership has been reinstated. Sign in at ${portal} to view your current status. This restores basic-member privileges only and does not activate paid subscriptions or bookings.`],
};

// Version 1 is immutable: retries must retain identical provider payloads.
export function memberNotificationTemplate(kind: string, version: number) {
  const message = version === 2 && kind === "admin_ready"
    ? ["An Armature application has been submitted", "A member has submitted their application for approval. Received: full name, email, phone number, LinkedIn URL, date of birth, privacy acceptance, a scanned profile photo and a scanned government ID. Guardian permission, where required, must still be reviewed before approval. Open https://armatureailabs.com/admin/members and sign in to see the applicant and submitted details. Review identity documents only inside the protected portal. Do not download or retain copies."]
    : version === 1 && Object.hasOwn(messages, kind) && messages[kind];
  if (!message) return null;
  const [subject, text] = message;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="max-width:560px;margin:0 auto;padding:24px;font:16px/1.6 Arial,sans-serif;color:#222"><p>${escaped.replace(/https:\/\/armatureailabs\.com\/[a-z/]+/g, '<a href="$&">$&</a>')}</p><p>Armature AI Labs</p></div>`;
  return { subject, text, html };
}
