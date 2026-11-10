import type { PropsWithChildren } from "react";
import { legalEntity } from "../data/legalEntity";
import "./PrivacyPage.css";

function LegalPage({ title, updated = true, children }: PropsWithChildren<{ title: string; updated?: boolean }>) {
  return <div className="privacy-page legal-page">
    <header className="page-hero">
      <div className="wrap">
        <h1>{title}</h1>
        {updated && <p className="hero-copy">Last updated: 10 November 2026</p>}
      </div>
    </header>
    <div className="wrap privacy-content">{children}</div>
  </div>;
}

export function ContactPage() {
  return <LegalPage title="Contact Us" updated={false}>
      <p>Armature AI Labs is operated by {legalEntity.name} (LLPIN {legalEntity.llpin}).</p>
    <section>
      <h2>Lab address</h2>
      <p>{legalEntity.labAddress.name}<br />{"\n"}{legalEntity.labAddress.formatted}</p>
    </section>
    <section>
      <h2>Registered office</h2>
      <p>{legalEntity.registeredOfficeAddress[0]}<br />{"\n"}{legalEntity.registeredOfficeAddress[1]}</p>
    </section>
    <section>
      <h2>Reach us</h2>
      <ul>
        <li>Email: <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a></li>
        <li>Phone and WhatsApp: <a href={`tel:${legalEntity.phone.replace(/\s/g, "")}`}>{legalEntity.phone}</a></li>
        <li>Hours: {legalEntity.supportHours}</li>
      </ul>
      <p>For bookings, payments, refunds or invoices, email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with your name, the booking or payment reference and a short description. We acknowledge requests within 1 business day.</p>
      <p>For privacy requests, email <a href={`mailto:${legalEntity.privacyEmail}`}>{legalEntity.privacyEmail}</a>.</p>
    </section>
    <section>
      <h2>Grievances</h2>
      <p>If you are not satisfied with how we handled a complaint, write to our Grievance Officer, {legalEntity.grievanceOfficer}, at <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with the subject "Grievance". We acknowledge complaints within 1 business day and resolve them by D+4 business days, where D is the day we receive the complaint.</p>
    </section>
  </LegalPage>;
}

export function TermsPage() {
  return <LegalPage title="Terms and Conditions">
      <p>These terms apply when you use armatureailabs.com, book or use space at Armature AI Labs, rent equipment, buy hardware, or attend a workshop. Armature AI Labs is operated by {legalEntity.name} (LLPIN {legalEntity.llpin}), referred to here as "we" or "us". By booking, paying or using our services, you agree to these terms.</p>
    <section>
      <h2>1. What we offer</h2>
      <ul>
        <li>Coworking: private cabins on monthly plans and individual desk passes for the dates shown in your quote at our lab in HSR Layout, Bengaluru.</li>
        <li>Equipment rental: the Hiwonder SO-ARM101 Advanced Kit, subject to confirmed availability, for a minimum of 7 days or a fixed 30-day period.</li>
        <li>Hardware sales: robotics hardware and kits, such as educational robotic arms, sensors and components.</li>
        <li>Workshops and events: paid sessions at the lab or online.</li>
      </ul>
      <p>Current prices are shown on the website or in your quote. Prices are in Indian Rupees. We are not currently GST-registered and do not add GST. Any future applicable tax will be disclosed before you accept a quote or pay.</p>
    </section>
    <section>
      <h2>2. Membership and eligibility</h2>
      <p>You must be at least 16 to register, and 18 to sign a cabin or seat agreement or rent equipment on your own. Applicants aged 16 or 17 need a guardian's written permission. We may ask for identity verification before you use paid services, as described in our Privacy Policy. We may decline or cancel a membership that breaks these terms.</p>
    </section>
    <section>
      <h2>3. Cabins and seats</h2>
      <ul>
        <li>Cabins are rented whole, at the cabin's listed price, whatever the number of people using it.</li>
        <li>New cabin bookings start on the first day of a calendar month and are charged in whole calendar months. There is no three-month minimum. The security deposit is 2 months' agreed rent at monthly rents up to INR 100,000, and 3 months' agreed rent above that amount.</li>
        <li>Individual desk passes cover the dates stated in your booking, with access from 9 am to 5 pm IST every day, including weekends, subject to disclosed closures. The cabin minimum and security deposit do not apply to desk passes.</li>
        <li>The first full calendar month is paid through Razorpay at booking. The security deposit is paid separately by bank transfer. Later rent is payable monthly in advance by the 5th. Daily proration is not offered. Existing signed agreements retain their terms.</li>
        <li>Either side may end a new cabin arrangement at month-end with at least 30 days' written notice. Rent remains payable for the full calendar months through that end date.</li>
        <li>Use only the power points provided. Any change to the cabin needs our written approval, and you must restore it when you leave.</li>
        <li>Your signed space agreement, if you have one, takes priority over this section.</li>
      </ul>
    </section>
    <section>
      <h2>4. Equipment rental</h2>
      <ul>
        <li>Equipment bookings require an approved signed agreement, verified rent payment through Razorpay and staff verification of the separate bank-transfer security deposit before confirmation or handover.</li>
        <li>You must follow the lab's safety rules and any instructions from our staff. Some equipment needs a short induction first.</li>
        <li>The Hiwonder kit stays in the lab and requires approved workspace access for the same period. It is one complete kit, not two separately rentable arms.</li>
        <li>You are responsible for loss of or damage to equipment during your booking, beyond normal wear. We will charge the repair or replacement cost, and may hold a deposit for higher-value items.</li>
        <li>The Hiwonder kit costs INR 1,050 per 7 days or INR 3,900 per fixed 30-day period, with a separately disclosed INR 25,000 security deposit.</li>
        <li>Report any fault immediately. Do not try to repair our equipment yourself.</li>
      </ul>
    </section>
    <section>
      <h2>5. Hardware sales</h2>
      <p>Product descriptions and prices are on the website or in your quote. An order is confirmed once payment is received. Delivery is covered by our Shipping and Delivery Policy and returns by our Cancellation and Refund Policy. Manufacturer warranties, where offered, are passed on to you.</p>
      <p>Equipment bought in the lab is sold as checked: you inspect it in person and accept its condition before paying. You get a full refund until you collect it, and no refund or return after collection.</p>
    </section>
    <section>
      <h2>6. Workshops and events</h2>
      <p>A seat is confirmed once payment is received. We may change the schedule, venue or instructor with reasonable notice. If we cancel a session, you get a full refund.</p>
      <p>Hiring the event space needs Armature's review, a signed agreement and payment through Razorpay. The hire is confirmed once payment is received.</p>
    </section>
    <section>
      <h2>7. Payments</h2>
      <p>Razorpay processes desk-pass payments and cabin and equipment rent. New cabin and equipment security deposits are collected separately by bank transfer using instructions confirmed by Armature for your booking. We do not see or store your card details, UPI PIN or net-banking credentials. Receipts are issued in the name you provide at checkout. Late payments may lead to suspension of access until dues are cleared.</p>
      <p>We record security deposits separately as refundable liabilities and issue a separate deposit receipt. Staff verify actual bank credit before confirming receipt; a transfer reference or screenshot alone is not sufficient. Cabin and equipment confirmation requires an approved signed agreement, captured rent and a verified deposit. Existing signed agreements and their recorded payment methods remain unchanged.</p>
    </section>
    <section>
      <h2>8. Conduct and safety</h2>
      <p>Treat other members, staff and the space with respect. No illegal activity, weapons, hazardous materials or unsafe experiments in the lab. Follow the house rules shared at onboarding. We may remove anyone who puts people or property at risk.</p>
    </section>
    <section>
      <h2>9. Your work and intellectual property</h2>
      <p>What you build at the lab belongs to you. We do not claim rights in your projects. We may photograph the space for our own use; we will ask before featuring you or your project by name.</p>
    </section>
    <section>
      <h2>10. Liability</h2>
      <p>We take reasonable care to keep the space and equipment safe and working. We are not liable for loss of your belongings, data or business, or for indirect losses. Our total liability for any claim is limited to the amount you paid us in the 3 months before the claim. Nothing here limits liability that cannot be limited by law.</p>
    </section>
    <section>
      <h2>11. Changes to these terms</h2>
      <p>We may update these terms. The date above shows the latest version. Changes do not affect bookings already paid for.</p>
    </section>
    <section>
      <h2>12. Governing law</h2>
      <p>These terms are governed by the laws of India. Courts in Bengaluru, Karnataka, have exclusive jurisdiction.</p>
    </section>
    <section>
      <h2>13. Contact</h2>
      <p>Questions about these terms: <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> or <a href={`tel:${legalEntity.phone.replace(/\s/g, "")}`}>{legalEntity.phone}</a>.</p>
    </section>
  </LegalPage>;
}

export function RefundPolicyPage() {
  return <LegalPage title="Cancellation and Refund Policy">
      <p>This policy covers payments made to {legalEntity.name} for Armature AI Labs. Approved refunds for payments collected through Razorpay are initiated to the original payment method within 5 to 7 working days of approval. Your bank may take a few more days to show the credit.</p>
    <p>The cabin rules below apply to new agreements. Existing signed cabin agreements retain their agreed cancellation and termination terms.</p>
    <div className="legal-table-scroll" role="region" aria-label="Cancellation and refund rules" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Service</th><th scope="col">Cancel or return</th><th scope="col">Refund</th></tr></thead>
        <tbody>
          <tr><td>Cabin, before move-in</td><td>30 or more days before the start date</td><td>Full refund of advance and deposit</td></tr>
          <tr><td>Cabin, before move-in</td><td>Less than 30 days before the start date</td><td>Deposit refunded; first month's rent kept</td></tr>
          <tr><td>Cabin, after move-in</td><td>Month-end after at least 30 days' written notice from either party</td><td>Deposit refunded within 7 working days of move-out, less unpaid dues and damage</td></tr>
          <tr><td>Monthly cabin rent already paid</td><td>Any time</td><td>Not refundable for unused days in that month</td></tr>
          <tr><td>Desk pass</td><td>Cancel at least 48 hours before the pass starts</td><td>Full refund</td></tr>
          <tr><td>Desk pass</td><td>Cancel less than 48 hours before the pass starts, or no-show</td><td>No refund</td></tr>
          <tr><td>Desk pass</td><td>After the pass starts</td><td>No refund for unused time</td></tr>
          <tr><td>Equipment or meeting room booking</td><td>48 hours or more before the slot</td><td>Full refund, or free reschedule once</td></tr>
          <tr><td>Equipment or meeting room booking</td><td>Less than 48 hours, or no-show</td><td>No refund</td></tr>
          <tr><td>Workshop or event seat</td><td>24 hours or more before the start</td><td>Full refund</td></tr>
          <tr><td>Workshop or event seat</td><td>Less than 24 hours before the start</td><td>No refund; credit for a future session</td></tr>
          <tr><td>Event space hire</td><td>48 hours or more before the event</td><td>50% refund</td></tr>
          <tr><td>Event space hire</td><td>Less than 48 hours before the event, or no-show</td><td>No refund</td></tr>
          <tr><td>Equipment bought in the lab</td><td>Before you collect the item</td><td>Full refund</td></tr>
          <tr><td>Equipment bought in the lab</td><td>After you collect the item</td><td>No refund</td></tr>
          <tr><td>Session cancelled by us</td><td>Any time</td><td>Full refund</td></tr>
          <tr><td>Hardware order, not yet dispatched</td><td>Any time before dispatch</td><td>Full refund</td></tr>
          <tr><td>Hardware, damaged, defective or wrong item</td><td>Report within 3 days of delivery</td><td>Replacement, or full refund if no replacement is available</td></tr>
        </tbody>
      </table>
    </div>
    <section>
      <h2>Bank deposits and equipment early returns</h2>
      <p>New cabin and equipment security deposits are paid and refunded by bank transfer, separately from Razorpay rent payments. Staff review deductions, verify the refund account and record the bank transfer reference. Cabin deposits are returned within 7 working days of move-out, less documented unpaid dues or damage beyond normal wear. Existing signed agreements and historical payment methods are preserved.</p>
      <p>Equipment security deposits are returned within 7 working days of return, less documented unpaid charges or damage beyond normal wear. Inspection takes place within that period and does not postpone the deadline.</p>
      <p>For early return of the Hiwonder kit within a paid 30-day period, rent is recalculated at INR 150 per day used, subject to the 7-day minimum and capped at the INR 3,900 already paid. Any remaining rent is refunded manually to the original payment method.</p>
    </section>
    <section>
      <h2>Hardware returns</h2>
      <ul>
        <li>Report the problem within 3 days of delivery or pickup, with photos or a short video and your order reference.</li>
        <li>Except for reasonable opening and testing to identify a defect, return items with all supplied parts and available original packaging.</li>
        <li>We do not accept returns of opened consumables, cut cables or wires, or components that have been soldered, flashed or modified.</li>
        <li>If an item is faulty, we pay the return shipping. In other cases, return shipping is paid by you.</li>
        <li>We refund or replace within 5 working days of receiving and checking the returned item.</li>
        <li>Equipment bought in the lab is checked by you in person before you pay, so these returns do not apply to it once you collect it.</li>
      </ul>
    </section>
    <section>
      <h2>Payment problems</h2>
      <p>If you were charged twice or the payment failed but money was debited, email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with the transaction reference. Duplicate charges are refunded in full within 5 to 7 working days.</p>
    </section>
    <section>
      <h2>How to ask for a refund</h2>
      <p>Email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with your name, the booking or order reference, and the reason. We acknowledge requests within 1 business day.</p>
    </section>
  </LegalPage>;
}

export function ShippingPolicyPage() {
  return <LegalPage title="Shipping and Delivery Policy">
      <p>This policy covers robotics hardware and kits sold by {legalEntity.name} under the Armature AI Labs name. Coworking, equipment rental and workshops are services delivered at our lab, so nothing is shipped for them; your booking confirmation is sent by email.</p>
    <section>
      <h2>Pickup from the lab</h2>
      <p>You can collect your order free of charge from {legalEntity.labAddress.name}, {legalEntity.labAddress.formatted}, during our working hours ({legalEntity.supportHours.replace(/ IST$/, "")}). We email you when it is ready, usually within 2 working days. Bring your order reference and a photo ID.</p>
    </section>
    <section>
      <h2>Delivery within India</h2>
      <ul>
        <li>We ship to addresses in India only.</li>
        <li>Orders are dispatched within 2 to 5 working days of payment. Items that are made to order or imported show their own lead time on the product page.</li>
        <li>Delivery usually takes 3 to 10 working days after dispatch, depending on your location.</li>
        <li>Shipping charges are shown at checkout before you pay.</li>
        <li>We email a tracking link once the order is dispatched.</li>
      </ul>
    </section>
    <section>
      <h2>Damaged or missing items</h2>
      <p>Check the package when it arrives. If it is damaged, opened or has items missing, email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> within 3 calendar days with photos and your order reference. We allow reasonable opening and testing when assessing defects. We will replace the item or refund you, as set out in our Cancellation and Refund Policy.</p>
    </section>
    <section>
      <h2>Delays</h2>
      <p>If your order is delayed beyond the stated time, we will tell you by email. You may cancel an undispatched order at any time for a full refund.</p>
    </section>
    <section>
      <h2>Contact</h2>
      <p>Shipping questions: <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> or <a href={`tel:${legalEntity.phone.replace(/\s/g, "")}`}>{legalEntity.phone}</a>.</p>
    </section>
  </LegalPage>;
}
