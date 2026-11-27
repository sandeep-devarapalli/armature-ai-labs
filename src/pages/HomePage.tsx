import { useRegistrationLabel } from "../context/AccountContext";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  LockKeyhole,
  PackageOpen,
  ShoppingBasket
} from "lucide-react";
import { Link } from "react-router-dom";
import { FieldOfTouch } from "../components/FieldOfTouch";
import { VitruvianSketch } from "../components/VitruvianSketch";
import "./HomePagePixel.css";
import { Metric, Section } from "../components/Primitives";
import { basicOnboardingAvailable, deskCheckoutAvailable, equipmentPageAvailable, eventCheckoutAvailable, memberPlatformAvailable, publicBookingsAvailable, rentalCheckoutAvailable, venturePassAvailable } from "../config/release";


export function HomePage() {
  const registrationLabel = useRegistrationLabel();
  return (
    <div className="landing-pixel">
      <header className="home-hero home-hero-integrated">
        <div className="wrap home-hero-inner">
          <div className="editorial-hero-grid editorial-hero-motion"><div className="editorial-hero-copy">
          <h1>A place to build<br/><span className="muted">physical intelligence.</span></h1>
          <p className="hero-copy">
            The armature is the core of every motor: the part that moves. Ours is
            {publicBookingsAvailable
              ? "a 3,500 sq ft lab across two floors in HSR Layout, Bengaluru, for building physical AI and robotics."
              : "a planned 3,500 sq ft lab across two floors, designed for the full path from idea to working machine: robotics, prototyping, ESD-safe benches, and GPU compute."}
          </p>
          {!memberPlatformAvailable && <p className="hero-location mono">{deskCheckoutAvailable ? "Free membership registration and paid desk passes are available." : basicOnboardingAvailable ? "Free membership registration and Guest Pass requests are available." : "Contact the lab about membership and booking availability."}</p>}
          <p className="hero-location mono">The Physical AI and Robotics Lab · HSR Layout, Bengaluru</p>
          <div className="button-row">
            {memberPlatformAvailable ? (
              <Link className="button button-primary" to="/book">
                <CalendarDays aria-hidden="true" />
                Book a workstation
              </Link>
            ) : basicOnboardingAvailable ? (
              <Link className="button button-primary" to="/onboarding">
                {registrationLabel}
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : (
              <a className="button button-primary" href="mailto:hello@armatureailabs.com">
                Enquire about membership
                <ArrowRight aria-hidden="true" />
              </a>
            )}
            {(publicBookingsAvailable || memberPlatformAvailable) && <Link className="button button-quiet" to="/bookings/">Explore bookings <ArrowRight aria-hidden="true" /></Link>}
            {equipmentPageAvailable && (
              <Link className="button button-quiet" to="/equipment">
                See the space
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>
          <aside className="hero-open-source" aria-labelledby="hero-open-source-title">
            <div>
              <h2 id="hero-open-source-title">Open source</h2>
              <p>Robot designs, software and model references from the lab.</p>
            </div>
            <a href="https://github.com/armature-ai-labs" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.3a2.9 2.9 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.5 7a4.4 4.4 0 0 0-.1-3.3S17.4 3.4 15 5a12 12 0 0 0-6 0C6.6 3.4 5.6 3.7 5.6 3.7A4.4 4.4 0 0 0 5.5 7a4.7 4.7 0 0 0-1.2 3.5c0 4.7 2.8 5.7 5.5 6a2.9 2.9 0 0 0-.8 2.2V22" />
              </svg>
              Explore on GitHub
              <ArrowUpRight className="hero-open-source-arrow" aria-hidden="true" />
            </a>
          </aside>
          </div><FieldOfTouch scene="scanner" priority look="pixel" /></div>
          <div className="hero-measure">
            <div className="metrics-strip">
              <Metric label="Footprint" value="3,500 sq ft" />
              <Metric label="Floors" value="2" />
              <Metric label="Planned cabins" value="7" />
              <Metric label="Balconies + terrace" value="3" />
            </div>
            <VitruvianSketch />
          </div>
        </div>
      </header>

      <HomeAccess />

      <Section
        number="01"
        title="From idea to working machine"
        lede="The intended workflow: work enters as a sketch and leaves as a machine someone has watched run."
      >
        <div className="section-motion motion-pair"><FieldOfTouch scene="gripper" look="pixel" /><FieldOfTouch scene="arm" look="pixel" /></div>
        <div className="process-line pipeline-line">
          {[
            ["Sketch", "Define the job and the test."],
            ["Build", "Use benches, printers, and tools."],
            ["Test", "Move into the arm cell or flexible test bay."],
            ["Show", "Run the prototype on the demo floor."],
            ["Ship", "Document it and take it into the world."]
          ].map(([title, copy], index) => (
            <div className="process-step" key={title}>
              <span className="mono">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        number="02"
        title="The maker desk keeps small friction small"
        lede="The planned maker desk brings secure storage, build-sized consumables, and complete portable toolkits alongside the equipment."
      >
        <div className="feature-grid">
          <article>
            <LockKeyhole aria-hidden="true" />
            <h3>Lock the project here</h3>
            <p>Planned small, medium, and tall secure lockers, with weekly, monthly, or yearly options to be confirmed.</p>
            <Link to="/maker-desk">Locker options <ArrowRight aria-hidden="true" /></Link>
          </article>
          <article>
            <ShoppingBasket aria-hidden="true" />
            <h3>Buy the handful</h3>
            <p>Planned bench stock includes screws, wire, headers, heat-shrink, solder, and other low-cost supplies in useful quantities.</p>
            <Link to="/maker-desk">Bench stock <ArrowRight aria-hidden="true" /></Link>
          </article>
          <article>
            <PackageOpen aria-hidden="true" />
            <h3>Rent a complete toolbox</h3>
            <p>Planned tagged electronics, mechanical, soldering, precision, and diagnostics kits, with checked returns.</p>
            <Link to="/maker-desk">Toolkit library <ArrowRight aria-hidden="true" /></Link>
          </article>
        </div>
      </Section>

      <div className="quote-band">
        <div className="wrap">
          <p>
            Most builders will never own a robot arm and dedicated GPU compute.
            <strong> We are building a place to share access.</strong>
          </p>
          <Link to="/join">
            {basicOnboardingAvailable ? "Explore membership" : "Membership enquiries"} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

const bookingOptions = [
  { item: "desk", available: deskCheckoutAvailable, name: "Desk passes", detail: "Reserve a seat for a day, week or month.", action: "Choose a desk pass" },
  { item: "guest", available: basicOnboardingAvailable, name: "Guest Pass", detail: "Free for meetings or events, with staff approval. For a reserved seat, choose a desk pass.", action: "Request a Guest Pass" },
  { item: "cabin", available: rentalCheckoutAvailable, name: "Team cabins", detail: "Request a quote for a private team workspace.", action: "View cabin quotes" },
  { item: "kit", available: rentalCheckoutAvailable, name: "Equipment", detail: "Browse equipment to rent and use at the lab.", action: "Browse equipment" },
  { item: "event", available: eventCheckoutAvailable, name: "Event space", detail: "Request a time and setup for your meetup, launch or demo.", action: "Request event space" }
];

function HomeAccess() {
  return (
    <div className="wrap home-access" id="lab-access">
      <section className="home-access-section home-access-membership" aria-labelledby="home-membership-title">
        <div className="home-access-intro">
          <h2 id="home-membership-title">Join the lab.</h2>
          <p>See membership options for individual builders and venture teams.</p>
        </div>
        <div className="home-access-content">
          <ul className="home-access-list">
            {basicOnboardingAvailable && <>
              <li><div><h3>Basic membership</h3><p>Free with a confirmed email. Create an account and explore free courses.</p></div>
                <Link aria-label="Create a Basic membership" to="/onboarding"><ArrowRight aria-hidden="true" /></Link></li>
              <li><div><h3>Golden Pass</h3><p>₹1,00,000 for 12 months of daily daytime access and priority booking.</p></div>
                <Link aria-label="Explore Golden Pass" to="/golden-pass"><ArrowRight aria-hidden="true" /></Link></li>
            </>}
            {venturePassAvailable && <li><div><h3>Venture Partner Pass</h3><p>₹5,00,000 per year for venture teams and their portfolio founders.</p></div>
              <Link aria-label="Explore Venture Partner Pass" to="/venture-partner-pass/"><ArrowRight aria-hidden="true" /></Link></li>}
          </ul>
          <Link className="button button-quiet" to="/join">See membership options <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>
      <section className="home-access-section home-access-booking" aria-labelledby="home-booking-title">
        <div className="home-access-intro">
          <h2 id="home-booking-title">Book the lab.</h2>
          <p>{publicBookingsAvailable ? "Find the right space, pass or equipment for your next visit." : "Contact the lab to check workspace and visit availability."}</p>
          {(deskCheckoutAvailable || rentalCheckoutAvailable || eventCheckoutAvailable) && (
            <div className="home-booking-verification">
              <h3>Before you book</h3>
              <p>Verify your ID and phone number before booking a desk pass, renting equipment or requesting event space.</p>
              <Link to="/onboarding">Go to verification <ArrowRight aria-hidden="true" /></Link>
            </div>
          )}
        </div>
        <div className="home-access-content">
          {publicBookingsAvailable && <ul className="home-access-list">
            {bookingOptions.filter(option => option.available).map(option => (
              <li key={option.item}>
                <div><h3>{option.name}</h3><p>{option.detail}</p></div>
                <Link aria-label={option.action} to={`/bookings/?item=${option.item}#steps`}>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>}
          {publicBookingsAvailable
            ? <Link className="button button-primary" to="/bookings/#book-access-title">Compare all bookings <ArrowRight aria-hidden="true" /></Link>
            : <a className="button button-quiet" href="mailto:hello@armatureailabs.com">Ask about availability <ArrowRight aria-hidden="true" /></a>}
        </div>
      </section>
    </div>
  );
}
