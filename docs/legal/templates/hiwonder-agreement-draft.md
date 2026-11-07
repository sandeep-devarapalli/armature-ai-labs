# Hiwonder Robot Arm Rental Agreement

**REUSABLE DRAFT. NOT FOR SIGNING OR PAYMENT UNTIL COMPLETED AND APPROVED.**

Prepared from the owner-supplied equipment draft and confirmed operating decisions. This is proposed contract copy for review, not a legal opinion. Resolve every bracketed field and confirm the source-draft clauses marked for review before execution. Do not publish populated customer information in this repository.

## Agreement particulars

| Item | Required value |
| --- | --- |
| Agreement reference and version | [AGREEMENT_REFERENCE], [VERSION] |
| Server quote reference and fingerprint | [QUOTE_REFERENCE], [QUOTE_FINGERPRINT] |
| Applicable website terms/refund version | [POLICY_VERSION_AND_LINKS] |
| Armature legal entity, LLPIN and PAN | [CONFIRMED_ENTITY], [LLPIN], [ARMATURE_PAN] |
| Armature registered office | [CONFIRMED_REGISTERED_OFFICE] |
| Armature authorised signer and notice email | [NAME], [DESIGNATION], [EMAIL] |
| Customer legal name and type | [LEGAL_NAME], [INDIVIDUAL_OR_COMPANY] |
| Customer PAN and contracting address | [CUSTOMER_PAN], [FULL_CONFIRMED_ADDRESS] |
| Company representative, if applicable | [NAME], [DESIGNATION], [AUTHORITY_REFERENCE] |
| Customer notice email | [EMAIL] |
| Lab location | [CONFIRMED_LAB_ADDRESS] |
| Asset identifier and readiness check | [CONFIRMED_ASSET_ID], [STAFF_CHECK_DATE] |
| Rental plan | [SEVEN_DAYS_OR_THIRTY_DAYS] |
| Rental start and end | [START_DATE_AND_TIME_IST], [END_DATE_AND_TIME_IST] |
| Required workspace booking/access | [WORKSPACE_REFERENCE_AND_MATCHING_DATES] |
| Access, handover and return hours | [CONFIRMED_HOURS_AND_APPOINTMENTS] |
| Quote validity | [VALID_UNTIL] |

## 1. Parties, review and final version

The entity named above, trading as Armature AI Labs (Armature), rents the specified kit to the named Customer. Both parties confirm their legal names, PANs, contracting addresses, notice contacts and signing authority before execution. A company representative confirms authority to bind that company.

The Customer may request changes before signing. Armature records corrections and issues a revised draft for fresh approval. Only the complete approved version is sent for execution. A subsequent material change requires renewed approval and signing. This draft does not establish that a physical handover has occurred.

## 2. Kit, location and period

One complete assembled Hiwonder LeRobot SO-ARM101 Advanced Kit, model SO-ARM101-A, is rented as one unit. The leader/follower pair is not sold as two independently rentable units. Only one complete kit is currently available, subject to staff's physical readiness and inventory check.

The kit remains Armature's property. It may be used only inside the lab, with the Customer's separately confirmed workspace access covering the rental period. Workspace is separately charged unless expressly included in the quote. This agreement permits no take-away rental, lending, sub-rental or transfer.

The minimum rental is seven days. Choose either exactly seven days at INR 1,050 or exactly 30 days at INR 3,900; a 30-day period does not change with calendar-month length. A rental day is 24 hours from the agreed start. Extensions require availability and a new approved quote. State the exact end timestamp above.

## 3. Charges and deposit

| Charge | Final quote amount |
| --- | --- |
| Seven-day rent OR fixed 30-day rent | INR [1050_OR_3900] |
| Refundable security deposit | INR 25,000 |
| GST collected | INR 0; Armature is currently unregistered for GST |
| Initial total | INR [26050_OR_28900] |
| Workspace access | [SEPARATE_CONFIRMED_WORKSPACE_CHARGES_OR_REFERENCE] |

The deposit does not limit documented liability under the agreed damage/loss terms. Armature initiates the deposit refund within seven working days of return, less documented unpaid charges or damage. Inspection occurs inside that period and does not postpone the deadline. Armature provides a written deduction statement with supporting evidence. Normal wear is not charged.

For early return within a paid 30-day period, rent is INR 150 per day used, subject to the seven-day minimum, capped at INR 3,900 already paid. Armature manually refunds any remaining rent. Do not impose an additional rental charge solely because this calculation reaches the cap. Record the actual return time and agreed day count.

## 4. Handover, condition and defects

At handover, Armature and the Customer power both arms, check operation and reconcile Schedule A. Record existing marks, missing items and condition with dated evidence references, then confirm the handover record. Repeat the inventory and condition check at return. Fair wear and tear is allowed.

Report damaged, defective, wrong or missing supplied items within three calendar days of handover. Reasonable opening and testing are allowed when assessing defects; the handover check does not waive a valid defect claim. Report faults or safety concerns promptly and stop unsafe use. Return the kit to Armature's control by the agreed end, during the agreed operating hours.

## 5. Use and care

Use the supplied 12V 5A power adapters. Do not force powered joints or keep servos stalled. Power off when idle. Keep the kit indoors, away from water, heat and direct sun. The arms have pinch points. Any permitted user under 18 must be supervised and satisfy the separately agreed access requirements.

Do not disassemble, drill, reprint parts, rewire or change servo IDs or firmware without written approval. Software, calibration and training on the Customer's computer are allowed within the agreed safety rules. Do not attempt hardware repairs without Armature's approval.

## 6. Cancellation, late return and damage

The existing published equipment booking policy provides a full refund or one free reschedule when cancellation is at least 48 hours before the slot. Cancellation less than 48 hours before the slot, or no-show, receives no refund. Approved refunds go back to the original payment method within five to seven working days of approval, with possible additional bank credit time. Preserve these commitments from `src/pages/LegalPages.tsx`; do not request blanket reconfirmation.

Separately state how the security deposit is returned when the kit was never handed over: [UNUSED_SECURITY_DEPOSIT_RETURN_CLAUSE]. Do not infer deposit forfeiture from the booking-fee cancellation rule.

The following additional clauses come from the equipment draft and remain subject to final approval. Resolve every review marker before signing; do not silently treat a proposed clause as approved.

- Proposed late-return clause: INR 150 per day overdue; seven days overdue without contact may be treated as loss after recorded follow-up. [CONFIRM_LATE_RETURN_AND_LOSS_PROCESS]
- Proposed damage clause: charge actual repair or replacement-part cost for damage beyond normal wear, and current replacement cost for missing items. For loss or theft, use documented current replacement cost, including applicable shipping/import duty. [CONFIRM_DAMAGE_AND_REPLACEMENT_BASIS]
- Proposed theft/shortfall clause: report theft to police and provide the complaint within 48 hours; pay documented amounts above the deposit within seven days of the written statement. [CONFIRM_REPORTING_AND_SHORTFALL_CLAUSE]
- Proposed termination clause: Armature may recover the kit for breach of use rules, false information or nonpayment, refunding unused rent less documented lawful deductions. [CONFIRM_TERMINATION_AND_REFUND_CLAUSE]

These clauses do not remove rights that applicable law makes mandatory. The confirmed seven-working-day deposit return deadline above remains distinct from the general approved-refund processing period.

## 7. Signing and payment

The current single Hiwonder kit uses PandaDoc without stamping under the owner's explicit exception. This exception does not approve unstamped agreements for future equipment.

The Customer signs the approved version first; Armature countersigns in a separate session. Each signer must finish the provider process. A separate Admin/Super admin account using MFA reviews the completed PDF and signature certificate, checks both signers and the exact quote binding, and records approval.

Start Razorpay checkout within 30 minutes of staff approval. Availability, price and the workspace prerequisite must still pass the final server checks. An expired window requires fresh availability/quote handling. Confirm the rental only after server verification of the captured payment, order, amount and currency and successful allocation of the kit. A browser redirect or signature alone is not payment confirmation. Equipment payment does not itself grant workspace access.

## 8. Notices, records and complaints

Formal notices use the confirmed email addresses above. Day-to-day messaging does not replace required formal notice. Armature acknowledges complaints within one business day and resolves them by D+4 business days, with D being receipt.

The executed PAN-bearing agreement and audit record are stored with restricted access under [APPROVED_EXECUTED_AGREEMENT_RETENTION_AND_PRIVACY_NOTICE]. Raw identity uploads are separate records; this agreement does not change their retention policy. Complete this reference before execution.

This document and its completed schedules record the parties' agreement. Subsequent changes require written agreement by both parties. Identify the applicable website terms/refund policies above and resolve conflicting language before signature. Confidential non-public business information must be protected. Proposed source-draft governing-law clause for review: Indian law, with disputes before competent courts at Bengaluru, subject to mandatory statutory rights.

## Schedule A: physical inventory

Reconcile this source checklist against the actual kit before handover. Do not promise missing or unchecked accessories. Record each count, asset/serial reference where present, condition and exceptions.

| Reference component | Expected source count | Confirmed count/condition |
| --- | --- | --- |
| Leader arm with six HX-10HM servos | 1 | [CONFIRM] |
| Follower arm with six HX-30HM servos | 1 | [CONFIRM] |
| 12V 5A power adapters | 2 | [CONFIRM] |
| Four-port USB hub | 1 | [CONFIRM] |
| USB Type-C cables | 2 | [CONFIRM] |
| 480p camera | 1 | [CONFIRM] |
| 1080p wide-angle camera | 1 | [CONFIRM] |
| Camera mount / camera brackets / camera USB cables | 1 / 2 / 2 | [CONFIRM] |
| G-clamps | 4 | [CONFIRM] |
| Spare servo cables / spare servo horn set | 3 / 1 | [CONFIRM] |
| Screwdrivers / cable ties / accessory pack | 2 / 10 / 1 | [CONFIRM] |

## Schedule B: handover and return records

[HANDOVER_DATE_TIME_CHECKS_CONDITION_EXISTING_MARKS_EVIDENCE_REFERENCES_AND_BOTH_PARTIES_CONFIRMATION]

[RETURN_DATE_TIME_CHECKS_CONDITION_MISSING_ITEMS_EVIDENCE_REFERENCES_AND_BOTH_PARTIES_CONFIRMATION]

[ITEMISED_DEDUCTIONS_RENT_RECALCULATION_REFUND_AMOUNT_AND_DEPOSIT_REFUND_DEADLINE]

## Signatures

Production layout instruction: use a separate signature page with two vertically separated full-width blocks. Reserve at least 55 mm clear signing space per signer. Keep names, dates and all clauses outside the signature fields. The provider certificate must identify both signers and completion timestamps.

**Customer**

[LEGAL_NAME / AUTHORISED_REPRESENTATIVE_AND_DESIGNATION]

[CUSTOMER_SIGNATURE_FIELD_WITH_55MM_CLEAR_SPACE]

[DATE_RECORDED_BY_PROVIDER]

**For Armature AI Labs**

[AUTHORISED_SIGNER_AND_DESIGNATION]

[ARMATURE_SIGNATURE_FIELD_WITH_55MM_CLEAR_SPACE]

[DATE_RECORDED_BY_PROVIDER]
