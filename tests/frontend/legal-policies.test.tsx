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
const labAddress = "1490, 11th Cross, 20th Main Rd, 1st Sector, HSR Layout, Bengaluru, Karnataka 560102";
const policies = [
  { route: "/contact", title: "Contact Us", Page: ContactPage, digest: "81125ab8d08f9448db7215015354e4988c8401018b49fe7bdfb53418f1f7a0ce" },
  { route: "/terms", title: "Terms and Conditions", Page: TermsPage, digest: "cc7c8d062aac61214e96c04664df08424f660c8733458f1e7a5fec3513604754" },
  { route: "/refund-policy", title: "Cancellation and Refund Policy", Page: RefundPolicyPage, digest: "42fdccf29669a31efdc6093c707421dd543bfd7373da1f56d73561ff72e228a4" },
  { route: "/shipping-policy", title: "Shipping and Delivery Policy", Page: ShippingPolicyPage, digest: "67163c16f6dbdaf3e3918a7cdecc7974432ee1b32c752b785df19032628badd3" }
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
    // Baseline includes owner-approved booking and complaint rules reconciled on 7 November 2026.
    const approvedBody = content.replace(/\s+/g, "")
      .replaceAll(legalName.replace(/\s+/g, ""), "[LEGAL_ENTITY_NAME]")
      .replaceAll(legalEntity.labAddress.formatted.replace(/\s+/g, ""), "[LAB_ADDRESS]");
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
      const footerElement = screen.getByRole("contentinfo");
      expect(within(footerElement).getByText(labAddress, { exact: true })).toBeInTheDocument();
      expect(footerElement).not.toHaveTextContent("560034");
      const footer = within(footerElement);
      for (const [name, href] of footerLinks) {
        expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
      }
    }
  );

  it("uses the corrected lab address while preserving the registered office", () => {
    expect(legalEntity.labAddress).toMatchObject({
      street: "1490, 11th Cross, 20th Main Rd, 1st Sector",
      locality: "HSR Layout", city: "Bengaluru", state: "Karnataka", postalCode: "560102", country: "IN"
    });
    expect(legalEntity.labAddress.formatted).toBe(labAddress);
    expect(legalEntity.registeredOfficeAddress).toEqual([
      "Flat No. 301, Siddahakala, Sankul Adarsh Nagar Vasco, Chicalim",
      "Mormugao, South Goa 403711, Goa, India"
    ]);
    const { container } = render(<MemoryRouter><ContactPage /></MemoryRouter>);
    expect(container.querySelector(".privacy-content")).toHaveTextContent(labAddress);
    expect(container).toHaveTextContent(legalEntity.registeredOfficeAddress.join(" "));
  });

  it("keeps the refund schedule a semantic table and contact channels actionable", () => {
    const { unmount } = render(<MemoryRouter><RefundPolicyPage /></MemoryRouter>);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Service", "Cancel or return", "Refund"]);
    expect(within(table).getAllByRole("row")).toHaveLength(15);
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
    expect(container).toHaveTextContent(labAddress);
    expect(container).not.toHaveTextContent("560034");
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


it("publishes the approved rental and complaint commitments without adding GST", () => {
  const terms = render(<MemoryRouter><TermsPage /></MemoryRouter>);
  expect(terms.container).toHaveTextContent("not currently GST-registered and do not add GST");
  expect(terms.container).toHaveTextContent("including weekends");
  expect(terms.container).toHaveTextContent("3 months' agreed rent above that amount");
  terms.unmount();
  const contact = render(<MemoryRouter><ContactPage /></MemoryRouter>);
  expect(contact.container).toHaveTextContent("D+4 business days");
  expect(contact.container).not.toHaveTextContent("resolve them within 30 days");
  contact.unmount();
  const shipping = render(<MemoryRouter><ShippingPolicyPage /></MemoryRouter>);
  expect(shipping.container).toHaveTextContent("within 3 calendar days");
  expect(shipping.container).toHaveTextContent("reasonable opening and testing");
});
