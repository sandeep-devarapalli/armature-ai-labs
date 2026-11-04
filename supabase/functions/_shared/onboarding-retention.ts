export function onboardingDocumentAvailable(document: { expires_at: string; deleted_at: string | null }, now = Date.now()): boolean {
  const expiry = Date.parse(document.expires_at);
  return !document.deleted_at && Number.isFinite(expiry) && expiry > now;
}
