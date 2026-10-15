# Marketplace local pilot contract

All RPCs use existing Supabase identity. IDs UUID; amounts INR decimal.

- `market_list_projects()` array: id,buyer_id,status,brief,provider_id,selected_proposal_id,agreement_version,created_at,saved. Public open plus own/proposed projects. Admin can review briefs, never private proposals.
- `market_project_detail(project_id)` object `{project,proposals,milestones,activity}`. Project includes agreement and acceptance versions for buyer/selected provider only. Proposals buyer all, provider own. Milestones/activity selected parties only.
- `market_project_action(project_id,action,payload)` returns detail. Create uses null ID.

Actions:
- create: brief `{title,deliverables,acceptance,category,skills,budget,timeline,location,workMode,sourceFiles,revisions,dependencies,confidentiality,materials,labRequirements}`. First three required, remainder strings; budget source entered string for pilot.
- submit_review / publish: `{}` owner/admin respectively.
- save: `{saved:boolean}`.
- propose: `{approach,relevantWork,schedule,ipTerms,confidentiality,revisions,milestones:[{title,deliverables,acceptance,serviceAmount:number,materialsAmount:number}]}`. Approved published profile owner only. Supersedes own old proposal preserving history.
- withdraw_proposal / select_provider: `{proposalId}`.
- revise_agreement: same as propose, selected participants before any funding. Clears both acceptances.
- agree: `{version:agreement_version}`.
- submit_deliverable: `{milestoneId,delivery}`. Delivery text/reference, not an automatic chat attachment.
- accept_delivery: `{milestoneId,version:submission_version}`.
- dispute: `{milestoneId,reason}`.

Proposal columns id,project_id,provider_id,version,offer,withdrawn,created_at. Milestones id,project_id,position,terms,funded,submission,submission_version,buyer_accepted,provider_accepted,disputed,paid,submitted_at,reminder_stage,mediation.

Payment simulation `market_simulate_payment(milestone_id,operation:fund|payout)` service role only AND explicit database setting armature.local_market_simulator=on. Never put service key in browser. UI simulator belongs to resettable synthetic demo; authenticated production interface must show payment activation disabled. No provider test setup. Service fee 10% serviceAmount only.

Reminder processor `market_process_reminders()` service role inserts idempotent activity at day 3 and mediation at day 7. External scheduling/notification delivery must be connected before operational release.

Messaging hook `private.market_project_conversation(project_id,proposal_id,buyer_id,provider_id)` called if installed on every proposal; message implementation reuses project/provider conversation across revisions.

Local test desk: same-origin loopback POST `/__market-local/sign-in` with `{role:buyer|provider|admin}` returns a synthetic Supabase session; `/reset` resets only the fixed synthetic project; `/payment` accepts `{milestoneId,operation:fund|payout}`. These routes exist only in Vite serve mode with the exact isolated Supabase URL. Credentials never reach the browser. The synthetic profile `market-local-provider` is owned by the provider account.

List adds `has_proposal`; detail adds `viewer_admin`. Invitations: buyer `invite {profileId}`, recipient `accept_invitation`/`decline_invitation {invitationId}`; `market_invitations()` lists only the viewer's invitations with `project_title`. Detail includes buyer/recipient-visible `invitations`. Acceptance starts private conversation, never automatically submits a proposal or assigns work.

Agreement validation requires schedule, IP/source terms, confidentiality and nonnegative integer revision allowance. Monetary values are finite INR values with at most two decimal places.
