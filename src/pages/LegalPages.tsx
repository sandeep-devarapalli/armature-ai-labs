import type { PropsWithChildren } from "react";
import { legalEntity, policyUpdatedDate } from "../data/legalEntity";
import "./PrivacyPage.css";

function LegalPage({ title, updated = true, children }: PropsWithChildren<{ title: string; updated?: boolean }>) {
  return <div className="privacy-page legal-page">
    <header className="page-hero">
      <div className="wrap">
        <h1>{title}</h1>
        {updated && <p className="hero-copy">Last updated: {policyUpdatedDate}</p>}
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
      <p>For bookings, payments, refunds or invoices, email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with your name, the booking or payment reference and a short description. We reply to general enquiries within 2 working days. Complaints follow the timetable below.</p>
      <p>For privacy requests, email <a href={`mailto:${legalEntity.privacyEmail}`}>{legalEntity.privacyEmail}</a>.</p>
    </section>
    <section>
      <h2>Grievances</h2>
      <p>To raise a complaint, contact our Grievance Officer, {legalEntity.grievanceOfficer}, at <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with the subject "Grievance", or call <a href={`tel:${legalEntity.phone.replace(/\s/g, "")}`}>{legalEntity.phone}</a>. We acknowledge complaints within 1 business day and resolve them by D+4 business days, where D is the date we receive the complaint.</p>
    </section>
  </LegalPage>;
}

export function TermsPage() {
  return <LegalPage title="Terms and Conditions">
      <p>These terms apply when you use armatureailabs.com, book or use space at Armature AI Labs, rent equipment, buy hardware, or attend a workshop. Armature AI Labs is operated by {legalEntity.name} (LLPIN {legalEntity.llpin}), referred to here as "we" or "us". By booking, paying or using our services, you agree to these terms.</p>
    <section>
      <h2>1. What we offer</h2>
      <ul>
        <li>Coworking: whole private cabins on monthly plans with a 3-month minimum, and individual hot desks or seats on day, week or month plans at our lab in HSR Layout, Bengaluru.</li>
        <li>Equipment rental: robotics and AI equipment, such as robotic arms and GPU workstations, on week or month plans with a minimum rental of 1 week.</li>
        <li>Hardware sales: robotics hardware and kits, such as educational robotic arms, sensors and components.</li>
        <li>Workshops and events: paid sessions at the lab or online. Meeting rooms are booked for the stated session duration.</li>
      </ul>
      <p>Current prices are shown on the website or in your quote. Prices are in Indian Rupees and GST is charged as applicable.</p>
    </section>
    <section>
      <h2>2. Membership and eligibility</h2>
      <p>You must be at least 16 to register, and 18 to sign a cabin or seat agreement or rent equipment on your own. Applicants aged 16 or 17 need a guardian's written permission. We may ask for identity verification before you use paid services, as described in our Privacy Policy. We may decline or cancel a membership that breaks these terms.</p>
    </section>
    <section>
      <h2>3. Cabins and seats</h2>
      <ul>
        <li>Cabins are rented whole, at the cabin's listed price, whatever the number of people using it.</li>
        <li>Cabins have a minimum term of 3 months. A cabin security deposit of 2 months' rent is payable before move-in.</li>
        <li>Individual hot desks and seats are available by the day, week or month. The cabin's 3-month minimum and 2-month deposit do not apply to these passes.</li>
        <li>Cabin rent and monthly desk fees are payable monthly in advance, by the date on your invoice. Day and week passes cover the dates stated in your booking.</li>
        <li>Either side may end a cabin arrangement after the minimum term with 30 days' written notice.</li>
        <li>Use only the power points provided. Any change to the cabin needs our written approval, and you must restore it when you leave.</li>
        <li>Your signed space agreement, if you have one, takes priority over this section.</li>
      </ul>
    </section>
    <section>
      <h2>4. Equipment rental</h2>
      <ul>
        <li>Rentals are available by the week or month, with a minimum rental of 1 week. Bookings are confirmed only after payment.</li>
        <li>You must follow the lab's safety rules and any instructions from our staff. Some equipment needs a short induction first.</li>
        <li>Equipment stays in the lab unless we agree otherwise in writing.</li>
        <li>You are responsible for loss of or damage to equipment during your booking, beyond normal wear. We will charge the repair or replacement cost. Any asset-specific deposit is disclosed in your quote before payment. We initiate its refund within 7 working days of equipment return, less documented unpaid charges or damage. The deadline runs from return and is not delayed by open-ended checks.</li>
        <li>Report any fault immediately. Do not try to repair our equipment yourself.</li>
      </ul>
    </section>
    <section>
      <h2>5. Hardware sales</h2>
      <p>Product descriptions and prices are on the website or in your quote. An order is confirmed once payment is received. Delivery is covered by our Shipping and Delivery Policy and returns by our Cancellation and Refund Policy. Manufacturer warranties, where offered, are passed on to you.</p>
    </section>
    <section>
      <h2>6. Workshops and events</h2>
      <p>Workshop and event seats, and meeting rooms, are booked for their stated session duration and confirmed once payment is received. We may change a workshop or event schedule, venue or instructor with reasonable notice. If we cancel a session, you get a full refund.</p>
    </section>
    <section>
      <h2>7. Payments</h2>
      <p>Online payments are processed by Razorpay. We do not see or store your full card number, CVV, UPI PIN or banking password. Tax invoices are issued in the name you provide at checkout. Late payments may lead to suspension of access until dues are cleared.</p>
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
      <p>This policy covers payments made to {legalEntity.name} for Armature AI Labs. We initiate approved refunds to the original payment method within 5 to 7 working days of approval, unless an earlier deadline is stated below. This is the time to submit the refund, not a promise of when your bank will show the credit. Your bank may take a few more days.</p>
    <div className="legal-table-scroll" role="region" aria-label="Cancellation and refund rules" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Service</th><th scope="col">Cancel or return</th><th scope="col">Refund</th></tr></thead>
        <tbody>
          <tr><td>Cabin, before move-in</td><td>7 or more days before the start date</td><td>Full refund of advance and deposit</td></tr>
          <tr><td>Cabin, before move-in</td><td>Less than 7 days before the start date</td><td>Deposit refunded; first month's rent kept</td></tr>
          <tr><td>Cabin, after move-in</td><td>30 days' written notice, after the 3-month minimum</td><td>Deposit refund initiated within 7 working days of move-out, less unpaid dues and damage</td></tr>
          <tr><td>Cabin rent already paid</td><td>After move-in</td><td>Not refundable for unused days in that month</td></tr>
          <tr><td>Day, week or month hot desk or reserved seat</td><td>Cancel at least 48 hours before the pass starts</td><td>Full refund</td></tr>
          <tr><td>Day, week or month hot desk or reserved seat</td><td>Cancel less than 48 hours before the pass starts, or no-show</td><td>No refund</td></tr>
          <tr><td>Day, week or month hot desk or reserved seat</td><td>After the pass starts</td><td>No refund for unused time</td></tr>
          <tr><td>Equipment rental or meeting room session</td><td>48 hours or more before the rental or session starts</td><td>Full refund, or free reschedule once</td></tr>
          <tr><td>Equipment rental or meeting room session</td><td>Less than 48 hours, or no-show</td><td>No refund</td></tr>
          <tr><td>Equipment rental deposit</td><td>Equipment returned</td><td>Deposit refund initiated within 7 working days of return, less documented unpaid charges or damage</td></tr>
          <tr><td>Workshop or event</td><td>24 hours or more before the start</td><td>Full refund</td></tr>
          <tr><td>Workshop or event</td><td>Less than 24 hours before the start</td><td>No refund; credit for a future session</td></tr>
          <tr><td>Session cancelled by us</td><td>Any time</td><td>Full refund</td></tr>
          <tr><td>Hardware order, not yet dispatched</td><td>Any time before dispatch</td><td>Full refund</td></tr>
          <tr><td>Hardware, damaged, defective, wrong or missing item</td><td>Report within 3 calendar days of delivery or pickup</td><td>Replacement, or full refund if no replacement is available</td></tr>
        </tbody>
      </table>
    </div>
    <section>
      <h2>Hardware returns</h2>
      <ul>
        <li>Report a damaged, defective, wrong or missing item within 3 calendar days of delivery or pickup, with photos or a short video and your order reference.</li>
        <li>Missing items do not require a return. We assess the claim against fulfilment and delivery records. If a refund is approved, we initiate it within 5 to 7 working days of approval.</li>
        <li>Keep all supplied parts and the original packaging where available. Reasonable opening and testing do not prevent a valid defect claim.</li>
        <li>Opened consumables, cut cables or wires, and components that have been soldered, flashed or modified are not eligible for change-of-mind returns. This does not exclude a valid defect claim or any applicable manufacturer warranty.</li>
        <li>If an item is faulty, we pay the return shipping. In other cases, return shipping is paid by you.</li>
        <li>We check the returned item and arrange a replacement or initiate the approved refund within 5 working days of receiving it. Applicable manufacturer warranties remain available under their terms.</li>
      </ul>
    </section>
    <section>
      <h2>Payment problems</h2>
      <p>If you were charged twice or the payment failed but money was debited, email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with the transaction reference. Once a duplicate charge is confirmed, we initiate a full refund within 5 to 7 working days of confirmation. Your bank may take a few more days to show the credit.</p>
    </section>
    <section>
      <h2>How to ask for a refund</h2>
      <p>Email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> with your name, the booking or order reference, and the reason. We acknowledge refund requests within 1 business day. Complaints are resolved by D+4 business days, where D is the date we receive the complaint.</p>
    </section>
  </LegalPage>;
}

export function ShippingPolicyPage() {
  return <LegalPage title="Shipping and Delivery Policy">
      <p>This policy covers robotics hardware and kits sold by {legalEntity.name} under the Armature AI Labs name. Coworking, equipment rental and meeting rooms are services delivered at our lab; workshops take place at the stated venue or online. Nothing is shipped for these service bookings, and your confirmation is sent by email.</p>
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
      <p>Check the package when it arrives. For damaged, defective, wrong or missing items, email <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> within 3 calendar days of delivery or pickup with photos and your order reference. Reasonable opening and testing do not prevent a valid defect claim; applicable manufacturer warranties remain available under their terms. We will replace the item or refund you, as set out in our Cancellation and Refund Policy.</p>
      <p>Missing items do not require a return. We assess the claim against fulfilment and delivery records. If a refund is approved, we initiate it within 5 to 7 working days of approval.</p>
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
