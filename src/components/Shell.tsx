import { deskCheckoutAvailable } from "../config/release";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  BookOpen,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  ClipboardCheck,
  LogIn,
  LogOut,
  PackageOpen,
  QrCode,
  UserRound,
  Wrench
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  basicOnboardingAvailable,
  equipmentPageAvailable,
  memberPlatformAvailable
} from "../config/release";
import { useApp } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import type { Theme } from "../types/domain";
import { AccountMenu } from "./AccountMenu";
import { BrandMark } from "./BrandMark";
import { AnalyticsConsent, AnalyticsSettingsButton } from "./AnalyticsConsent";
import { PageMetadata } from "./PageMetadata";
import { legalEntity } from "../data/legalEntity";

const primaryLinks = [["/", "The lab"], ["/join", "Membership"], ["/services", "Services"], ["/ecosystem", "Ecosystem"]] as const;
const moreLinks = [["/members", "Members"], ["/talent-network", "Talent network"],
  ["/about", "Who we are"],
  ...(equipmentPageAvailable ? [["/equipment", "Equipment"]] : []),
  ["/projects", "Projects"], ["/blog", "Blog"], ["/components", "Equipment & Components"]
] as const;
const coursesUrl = "https://courses.armatureailabs.com/";

const socialLinks = [
  ["GitHub", "https://github.com/armature-ai-labs", "M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.3a2.9 2.9 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.5 7a4.4 4.4 0 0 0-.1-3.3S17.4 3.4 15 5a12 12 0 0 0-6 0C6.6 3.4 5.6 3.7 5.6 3.7A4.4 4.4 0 0 0 5.5 7a4.7 4.7 0 0 0-1.2 3.5c0 4.7 2.8 5.7 5.5 6a2.9 2.9 0 0 0-.8 2.2V22"],
  ["YouTube", "https://www.youtube.com/@armatureailabs", "M5.5 5.5h13a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Zm4.5 3.5 5 3-5 3Z"],
  ["Instagram", "https://www.instagram.com/armatureailabs/", "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm4 5a4 4 0 1 0 0 8 4 4 0 1 0 0-8Zm5.5-1.5h.01"],
  ["X", "https://x.com/armatureailabs", "M4.5 3.5h4.2L20 20.5h-4.2zM19.5 3.5 4.5 20.5"],
  ["LinkedIn", "https://www.linkedin.com/company/armature-ai-labs/", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2.5 7.5v6m0-9h.01m4.5 9v-6m0 2a2.2 2.2 0 0 1 4.4 0v4"],
  ["Discord", "https://discord.gg/qGNXGmF8z", "M8 5 5 6s-2.5 4-2.5 9.7L7 18l1.1-2m7.9-11 3 1s2.5 4 2.5 9.7L17 18l-1.1-2M7 15a11 11 0 0 0 10 0M9 11.5h.01m6 0h.01"]
] as const;

const memberLinks = [
  ["/dashboard", "Dashboard", ClipboardCheck],
  ["/book", "Book", BookOpen],
  ["/bookings", "Bookings", CalendarDays],
  ["/check-in", "Check in", QrCode],
  ["/inventory", "Inventory", Boxes],
  ["/maker-desk", "Maker desk", PackageOpen],
  ["/component-requests", "Requests", ClipboardList]
] as const;

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label="Color theme">
      {(["light", "dark"] as Theme[]).map((option) => (
        <button
          key={option}
          type="button"
          className={theme === option ? "active" : ""}
          aria-pressed={theme === option}
          aria-label={`${option} theme`}
          title={`${option} theme`}
          onClick={() => setTheme(option)}
        >
          <span className={`theme-swatch ${option}`} />
        </button>
      ))}
    </div>
  );
}

function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const previousLocation = useRef<{ pathname: string; hash: string } | null>(null);
  useEffect(() => {
    const previous = previousLocation.current;
    previousLocation.current = { pathname, hash };
    if (pathname === "/ecosystem" && previous?.pathname === pathname && previous.hash === hash) return;
    if (pathname.replace(/\/$/, "") === "/talent-network" && hash) return;
    if (hash) {
      const scrollToTarget = () => {
        const target = document.getElementById(hash.slice(1));
        if (!target) return false;
        target.scrollIntoView({ behavior: "instant", block: "start" });
        return true;
      };
      if (scrollToTarget()) return;
      const observer = new MutationObserver(() => {
        if (scrollToTarget()) observer.disconnect();
      });
      observer.observe(document.getElementById("main") ?? document.body, { childList: true, subtree: true });
      const timeout = window.setTimeout(() => observer.disconnect(), 5000);
      return () => { observer.disconnect(); window.clearTimeout(timeout); };
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash, key]);
  return null;
}

export function Shell({ children }: PropsWithChildren) {
  const navigationLinks = deskCheckoutAvailable
    ? [...primaryLinks.slice(0, 2), ["/bookings/", "Bookings"] as const, ...primaryLinks.slice(2)]
    : primaryLinks;
  const { currentMember, isAdmin, isStaff, mode, online, notice, clearNotice, signOut } = useApp();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const resourcesMenu = useRef<HTMLDetailsElement>(null);
  const header = useRef<HTMLElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const workspaceLinksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    if (moreMenu.current) moreMenu.current.open = false;
    if (resourcesMenu.current) resourcesMenu.current.open = false;
    workspaceLinksRef.current
      ?.querySelector<HTMLAnchorElement>("a.active")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname, currentMember, isAdmin, isStaff]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!resourcesMenu.current?.contains(event.target as Node) && resourcesMenu.current) resourcesMenu.current.open = false;
      if (!moreMenu.current?.contains(event.target as Node) && moreMenu.current) moreMenu.current.open = false;
      if (!header.current?.contains(event.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <div className="app-shell">
      <PageMetadata />
      <div className="editorial-frame" aria-hidden="true" />
      <div className="editorial-rail" aria-hidden="true">Armature AI Labs</div>
      <ScrollToTop />
      <a className="skip-link" href="#main" onClick={(event) => {
        if (pathname.replace(/\/$/, "") !== "/talent-network") return;
        event.preventDefault();
        const content = document.getElementById("main");
        if (!content) return;
        content.tabIndex = -1;
        content.focus({ preventScroll: true });
        content.scrollIntoView({ block: "start" });
      }}>
        Skip to content
      </a>
      <header className="topbar" ref={header} onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (resourcesMenu.current?.open) { resourcesMenu.current.open = false; resourcesMenu.current.querySelector("summary")?.focus(); }
        if (moreMenu.current?.open) { moreMenu.current.open = false; moreMenu.current.querySelector("summary")?.focus(); }
        if (mobileMenuOpen) { setMobileMenuOpen(false); mobileTrigger.current?.focus(); }
      }}>
        <div className={`wrap topbar-inner${basicOnboardingAvailable ? " with-basic-account" : ""}`}>
          <Link to="/" className="brand-link">
            <BrandMark />
          </Link>
          <nav className="public-nav" aria-label="Primary navigation">
            {navigationLinks.map(([to, label], index) => (
              <span className="primary-nav-item" key={to}>
                <NavLink to={to} end={to === "/"}>{label}</NavLink>
                {index === (deskCheckoutAvailable ? 2 : 1) && <a href={coursesUrl}>Courses</a>}
              </span>
            ))}
            <details className="nav-more" ref={resourcesMenu}>
              <summary className={pathname.startsWith("/resources") ? "active" : ""}>Resources <span aria-hidden="true">⌄</span></summary>
              <div className="nav-more-panel">
                <NavLink to="/resources/white-paper">White Paper</NavLink>
                <NavLink to="/resources/white-paper/robotic-actuators">Robotic actuators</NavLink>
                <a href="/resources/white-paper/robotic-actuators/white-paper.html">Read white paper</a>
                <a href="/resources/white-paper/robotic-actuators/actuator-specifications.html">Actuator specifications</a>
                <NavLink to="/resources/hackathons">Hackathons</NavLink>
                <NavLink to="/ecosystem#builder-resources">Tools &amp; resources for builders</NavLink>
              </div>
            </details>
            <details className="nav-more" ref={moreMenu}>
              <summary className={moreLinks.some(([to]) => pathname === to || pathname.startsWith(`${to}/`)) ? "active" : ""}>More <span aria-hidden="true">⌄</span></summary>
              <div className="nav-more-panel">{moreLinks.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</div>
            </details>
          </nav>
          <div className="topbar-actions">
            <ThemeSwitch />
            {basicOnboardingAvailable && <AccountMenu />}
            {!basicOnboardingAvailable && memberPlatformAvailable && (currentMember ? (
              <button className="icon-button" type="button" onClick={() => void signOut()} title="Sign out">
                <LogOut aria-hidden="true" />
                <span className="sr-only">Sign out</span>
              </button>
            ) : (
              <Link className="icon-button" to="/auth" title="Sign in">
                <LogIn aria-hidden="true" />
                <span className="sr-only">Sign in</span>
              </Link>
            ))}
          </div>
        </div>
        <nav className="compact-mobile-nav" aria-label="Quick navigation">
          <NavLink to="/" end>The lab</NavLink>
          {deskCheckoutAvailable && <NavLink to="/bookings/">Bookings</NavLink>}
          <a href={coursesUrl}>Courses</a>
          <button ref={mobileTrigger} type="button" aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileMenuOpen} aria-controls="mobile-public-menu" onClick={() => setMobileMenuOpen(open => !open)}>Menu <span aria-hidden="true">{mobileMenuOpen ? "−" : "+"}</span></button>
        </nav>
        {mobileMenuOpen && (
          <nav id="mobile-public-menu" className="mobile-public-menu" aria-label="Mobile navigation">
            <div className="wrap">
              {[...navigationLinks.slice(1), ...moreLinks].map(([to, label]) => (
                <NavLink key={to} to={to} end={to === "/"}>
                  {label}
                </NavLink>
              ))}
              <NavLink to="/resources/white-paper">Resources / White Paper</NavLink>
              <NavLink to="/resources/white-paper/robotic-actuators">Robotic actuators</NavLink>
              <a href="/resources/white-paper/robotic-actuators/white-paper.html">Read white paper</a>
              <a href="/resources/white-paper/robotic-actuators/actuator-specifications.html">Actuator specifications</a>
              <NavLink to="/resources/hackathons">Resources / Hackathons</NavLink>
              {memberPlatformAvailable && <Link to={currentMember ? "/dashboard" : "/auth"}>
                {currentMember ? "Member workspace" : "Member sign in"}
              </Link>}
              {memberPlatformAvailable && currentMember && (
                <button type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      {memberPlatformAvailable && currentMember && (
        <nav className="workspace-nav" aria-label="Member workspace">
          <div className="wrap workspace-inner">
            <div className="workspace-links" ref={workspaceLinksRef}>
              {memberLinks.map(([to, label, Icon]) => (
                <NavLink key={to} to={to}>
                  <Icon aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
              <NavLink to="/profile">
                <UserRound aria-hidden="true" />
                Profile
              </NavLink>
              {isStaff && <NavLink to="/admin/members">
                <Wrench aria-hidden="true" />
                Operations
              </NavLink>}
              {isAdmin && <NavLink to="/financials">
                <CircleDollarSign aria-hidden="true" />
                Financials
              </NavLink>}
            </div>
            <div className="environment-state mono">
              <span className={online ? "dot dot-good" : "dot dot-bad"} />
              {online ? "online" : "read-only offline"} · {mode}
            </div>
          </div>
        </nav>
      )}

      {notice && (
        <div className="notice" role="status">
          <div className="wrap notice-inner">
            <span>{notice}</span>
            <button type="button" onClick={clearNotice}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <AnalyticsConsent />
      <main id="main">{children ?? <Outlet />}</main>
      <footer>
        <div className="wrap footer-grid">
          <div>
            <BrandMark />
            <p>The Physical AI and Robotics Lab · HSR Layout, Bengaluru</p>
            <p>{legalEntity.labAddress.formatted}</p>
            <p>{legalEntity.name} (LLPIN {legalEntity.llpin})</p>
          </div>
          <div className="footer-links">
            <a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>
            <a href={`tel:${legalEntity.phone.replace(/\s/g, "")}`}>{legalEntity.phone}</a>
            <Link to="/members">Members</Link>
            <Link to="/maker-desk">Maker desk</Link>
            <Link to="/branding">Brand assets</Link>
            <Link to="/about">Who we are</Link>
            <Link to="/team">Meet the team</Link>
            <AnalyticsSettingsButton />
            <Link to="/building-vision">Building vision</Link>
            <Link to="/blog">Blog</Link>
            <a href="https://github.com/sandeep-devarapalli/armature-ai-labs/tree/main/docs">Docs</a>
            <Link to="/components/wishlist">Equipment wishlist</Link>
            {memberPlatformAvailable && <Link to="/kiosk">Kiosk</Link>}
            <Link to="/join">Join the floor</Link>
          </div>
          <nav className="footer-links" aria-label="Legal">
            <Link to="/contact">Contact</Link>
            <Link to="/terms">Terms and Conditions</Link>
            <Link to="/refund-policy">Cancellation and Refund Policy</Link>
            <Link to="/shipping-policy">Shipping and Delivery Policy</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
          <p className="license-note">
            Code and docs Apache-2.0. Armature AI Labs name and brand assets reserved.
            Third-party project media remains subject to its source terms.
          </p>
        </div>
        <nav className="wrap footer-social" aria-labelledby="footer-social-title">
          <h2 id="footer-social-title">Follow the lab</h2>
          <div>
            {socialLinks.map(([name, href, icon]) => (
              <a key={name} href={href} target="_blank" rel="noreferrer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={icon} />
                </svg>
                {name}
              </a>
            ))}
          </div>
        </nav>
        <div className="footer-signature" aria-hidden="true">
          <p className="footer-wordmark">Armature AI Labs</p>
        </div>
      </footer>
    </div>
  );
}
