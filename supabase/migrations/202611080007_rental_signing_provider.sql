-- PandaDoc and DocuSign are alternative signing tools. The choice lives in the particulars, which are
-- part of the agreement hash, so switching provider after signing needs a fresh final draft.
-- Either provider still requires manual completed-document upload and independent MFA approval.
alter table private.rental_quotes add column signing_provider text
 generated always as (coalesce(particulars->>'signingProvider','pandadoc')) stored
 check(signing_provider in ('pandadoc','docusign'));
alter table private.rental_quotes add constraint rental_docusign_envelope_id
 check(signing_provider<>'docusign' or document_id is null
  or document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
