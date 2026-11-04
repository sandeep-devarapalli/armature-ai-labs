import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Shell } from "../../src/components/Shell";
import { legalEntity } from "../../src/data/legalEntity";
import { ContactPage, RefundPolicyPage, ShippingPolicyPage, TermsPage } from "../../src/pages/LegalPages";
import { PrivacyPage } from "../../src/pages/PrivacyPage";

vi.mock("../../src/context/AppContext", () => ({
  useApp: () => ({ currentMember: null, isAdmin: false, isStaff: false, mode: "supabase", online: true, notice: null, clearNotice: vi.fn(), signOut: vi.fn() })
}));
vi.mock("../../src/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() })
}));

const legalName = legalEntity.name;
const policies = [
  { route: "/contact", title: "Contact Us", Page: ContactPage, digest: "120967f39b8a978bf10a712d6c9256801c11901e199e06853f93ee2b478a214e" },
  { route: "/terms", title: "Terms and Conditions", Page: TermsPage, digest: "a4ade1e09327ceaeaea52fb2d5c83e33c34c39f8b49773040f701a80167c7262" },
  { route: "/refund-policy", title: "Cancellation and Refund Policy", Page: RefundPolicyPage, digest: "3bc0331ff825fbec12e7e3318be7e4ebd3aaaa0bcb88d2a0851ee0ad5b64fcfc" },
  { route: "/shipping-policy", title: "Shipping and Delivery Policy", Page: ShippingPolicyPage, digest: "feb42d188e5d3a88c04466089f316c06ebf263bdf916f14ddffa90e6c82dcde8" }
];
const footerLinks = [
  ["Contact", "/contact"], ["Terms and Conditions", "/terms"],
  ["Cancellation and Refund Policy", "/refund-policy"],
  ["Shipping and Delivery Policy", "/shipping-policy"], ["Privacy", "/privacy"]
];

afterEach(cleanup);

describe("approved legal policies", () => {
  it.each(policies)("preserves every approved word and table cell on $route", ({ Page, title, digest }) => {
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    const content = container.querySelector(".privacy-content")!.textContent!;
    // Pin approved wording while allowing the shared operator name to change in one place.
    const approvedBody = content.replaceAll(legalName, "[LEGAL_ENTITY_NAME]").replace(/\s+/g, "");
    expect(createHash("sha256").update(approvedBody).digest("hex")).toBe(digest);
    expect(content).toContain(legalName);
    expect(content).not.toContain("\u2014");
    expect(container).not.toHaveTextContent("[date of publishing]");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each([...policies, { route: "/privacy", title: "Your information, handled with care.", Page: PrivacyPage }])(
    "exposes the five legal footer links and operator on $route", ({ Page, route, title }) => {
      render(<MemoryRouter initialEntries={[route]}><Shell><Page /></Shell></MemoryRouter>);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveTextContent(legalName);
      const footer = within(screen.getByRole("contentinfo"));
      for (const [name, href] of footerLinks) {
        expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
      }
    }
  );

  it("keeps the refund schedule a semantic table and contact channels actionable", () => {
    const { unmount } = render(<MemoryRouter><RefundPolicyPage /></MemoryRouter>);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Service", "Cancel or return", "Refund"]);
    expect(within(table).getAllByRole("row")).toHaveLength(12);
    expect(within(table).getByRole("cell", { name: "48 hours or more before the slot" })).toBeInTheDocument();
    unmount();
    render(<MemoryRouter><ContactPage /></MemoryRouter>);
    for (const email of ["hello@armatureailabs.com", "privacy@armatureailabs.com"]) {
      const links = screen.getAllByRole("link", { name: email });
      for (const link of links) expect(link).toHaveAttribute("href", `mailto:${email}`);
    }
    expect(screen.getByRole("link", { name: "+91 97484 85583" })).toHaveAttribute("href", "tel:+919748485583");
  });

  it("places the approved payment notice between identity review and equipment requests", () => {
    const { container } = render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
    const headings = [...container.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(headings.indexOf("Payments")).toBe(headings.indexOf("Basic membership and identity review") + 1);
    expect(headings.indexOf("Equipment requests and votes")).toBe(headings.indexOf("Payments") + 1);
    expect(container).toHaveTextContent("Razorpay Payments Private Limited and its partner banks");
    expect(container).toHaveTextContent("We keep invoices and payment records for as long as Indian tax and accounting laws require, even if you close your account.");
    expect(container).toHaveTextContent("Payments are covered in the Payments section above, and in our Terms and Conditions and Cancellation and Refund Policy.");
  });

  it("does not ship the superseded operator spelling in source or public text assets", () => {
    const oldSpelling = ["Nagesh", "wara"].join("");
    function textFiles(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? textFiles(filename) : /\.(?:[cm]?[jt]sx?|css|html?|json|md|txt|xml|svg|webmanifest)$/.test(filename) ? [filename] : [];
      });
    }
    const matches = ["src", "public"].flatMap(textFiles).filter((filename) => readFileSync(filename, "utf8").includes(oldSpelling));
    expect(matches).toEqual([]);
  });
});
