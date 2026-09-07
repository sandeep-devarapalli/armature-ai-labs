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
  Menu,
  PackageOpen,
  QrCode,
  UserRound,
  Wrench
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  componentRequestsAvailable,
  equipmentPageAvailable,
  memberPlatformAvailable
} from "../config/release";
import { useApp } from "../context/AppContext";
import { useTheme } from "../context/ThemeContext";
import type { Theme } from "../types/domain";
import { BrandMark } from "./BrandMark";

const publicLinks = [
  ["/", "The lab"],
  ...(equipmentPageAvailable ? [["/equipment", "Equipment"]] : []),
  ["/join", "Membership"],
  ["/services", "Services"],
  ["/projects", "Projects"],
  ["/ecosystem", "Ecosystem"],
  ["/components", "Components"],
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
      {(["light", "dark", "sepia"] as Theme[]).map((option) => (
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
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

export function Shell({ children }: PropsWithChildren) {
  const { currentMember, isAdmin, isStaff, mode, online, notice, clearNotice, signOut } = useApp();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const workspaceLinksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    workspaceLinksRef.current
      ?.querySelector<HTMLAnchorElement>("a.active")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname, currentMember, isAdmin, isStaff]);

  return (
    <div className="app-shell">
      <ScrollToTop />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link to="/" className="brand-link">
            <BrandMark />
          </Link>
          <nav className="public-nav" aria-label="Primary navigation">
            {publicLinks.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-actions">
            <ThemeSwitch />
            <button
              className="icon-button mobile-menu-link"
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-public-menu"
              title="Navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Menu aria-hidden="true" />
              <span className="sr-only">{mobileMenuOpen ? "Close navigation" : "Open navigation"}</span>
            </button>
            {memberPlatformAvailable && (currentMember ? (
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
        {mobileMenuOpen && (
          <nav id="mobile-public-menu" className="mobile-public-menu" aria-label="Mobile navigation">
            <div className="wrap">
              {publicLinks.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === "/"}>
                  {label}
                </NavLink>
              ))}
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

      <main id="main">{children ?? <Outlet />}</main>
      <footer>
        <div className="wrap footer-grid">
          <div>
            <BrandMark />
            <p>The Physical AI and Robotics Lab · HSR Layout, Bengaluru</p>
          </div>
          <div className="footer-links">
            <a href="mailto:hello@armaturelab.org">hello@armaturelab.org</a>
            <a href="tel:+919748485583">+91 9748485583</a>
            <a href="https://discord.gg/qGNXGmF8z" target="_blank" rel="noreferrer">Discord</a>
            <a href="https://www.linkedin.com/company/armature-ai-labs/" target="_blank" rel="noreferrer">LinkedIn</a>
            <Link to="/members">Members</Link>
            <Link to="/maker-desk">Maker desk</Link>
            <Link to="/branding">Brand assets</Link>
            {componentRequestsAvailable && <Link to="/components/request">Request a component</Link>}
            {memberPlatformAvailable && <Link to="/kiosk">Kiosk</Link>}
            <Link to="/join">Join the floor</Link>
          </div>
          <p className="license-note">
            Code and docs Apache-2.0. Armature AI Labs name and brand assets reserved.
            Third-party project media remains subject to its source terms.
          </p>
        </div>
      </footer>
    </div>
  );
}
