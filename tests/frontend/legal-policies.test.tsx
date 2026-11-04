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
  { route: "/contact", title: "Contact Us", Page: ContactPage, digest: "fd5441c15d315a0ec9fc5aa34c9048903d86a88918e4648ce08337ed866d42a3" },
  { route: "/terms", title: "Terms and Conditions", Page: TermsPage, digest: "c64bc6fcb3c754c93675f1d2ef2d6a87c83a3bf0e50d41662ffaba2255c8ffa0" },
  { route: "/refund-policy", title: "Cancellation and Refund Policy", Page: RefundPolicyPage, digest: "e05f14b54b669cf294ca7081392d2c1028db294c1e34f37f0c2aa135e6072c16" },
  { route: "/shipping-policy", title: "Shipping and Delivery Policy", Page: ShippingPolicyPage, digest: "f320496b0ea1e08c8828bfb59fc059e155bd1174441ecee961eb8aa932328b4d" }
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
    // Includes the owner's 4 November commercial and complaint-policy corrections.
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
    expect(within(table).getAllByRole("row")).toHaveLength(16);
    expect(within(table).getByRole("cell", { name: "48 hours or more before the rental or session starts" })).toBeInTheDocument();
    unmount();
    render(<MemoryRouter><ContactPage /></MemoryRouter>);
    for (const email of ["hello@armatureailabs.com", "privacy@armatureailabs.com"]) {
      const links = screen.getAllByRole("link", { name: email });
      for (const link of links) expect(link).toHaveAttribute("href", `mailto:${email}`);
    }
    for (const link of screen.getAllByRole("link", { name: "+91 97484 85583" })) {
      expect(link).toHaveAttribute("href", "tel:+919748485583");
    }
  });

  it("limits cabin minimums and deposits to cabins and states equipment rental periods", () => {
    const { container } = render(<MemoryRouter><TermsPage /></MemoryRouter>);
    expect(container).toHaveTextContent("Cabins have a minimum term of 3 months. A cabin security deposit of 2 months' rent");
    expect(container).toHaveTextContent("The cabin's 3-month minimum and 2-month deposit do not apply to these passes.");
    expect(container).toHaveTextContent("on day, week or month plans");
    expect(container).toHaveTextContent("Rentals are available by the week or month, with a minimum rental of 1 week.");
    expect(container).toHaveTextContent("Any asset-specific deposit is disclosed in your quote before payment.");
    expect(container).toHaveTextContent("meeting rooms, are booked for their stated session duration");
    expect(container).not.toHaveTextContent("booked by the hour or day");
    expect(container).not.toHaveTextContent("minimum term for a cabin or seat");
  });

  it("applies the approved cancellation boundary to every desk pass without cabin deductions", () => {
    render(<MemoryRouter><RefundPolicyPage /></MemoryRouter>);
    const rows = within(screen.getByRole("table")).getAllByRole("row")
      .filter((row) => row.textContent?.includes("Day, week or month hot desk or reserved seat"));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Cancel at least 48 hours before the pass starts");
    expect(within(rows[0]).getByRole("cell", { name: /^Full refund$/ })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("Cancel less than 48 hours before the pass starts, or no-show");
    expect(within(rows[1]).getByRole("cell", { name: /^No refund$/ })).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("After the pass starts");
    expect(rows[2]).toHaveTextContent("No refund for unused time");
    for (const row of rows) expect(row).not.toHaveTextContent(/deposit|first month's rent|quote/i);
  });

  it("starts the equipment-deposit refund deadline at return and requires documented deductions", () => {
    const { container, unmount } = render(<MemoryRouter><TermsPage /></MemoryRouter>);
    expect(container).toHaveTextContent("within 7 working days of equipment return, less documented unpaid charges or damage");
    expect(container).toHaveTextContent("The deadline runs from return and is not delayed by open-ended checks.");
    unmount();
    render(<MemoryRouter><RefundPolicyPage /></MemoryRouter>);
    const row = within(screen.getByRole("table")).getAllByRole("row")
      .find((item) => item.textContent?.startsWith("Equipment rental deposit"))!;
    expect(row).toHaveTextContent("Equipment returned");
    expect(row).toHaveTextContent("within 7 working days of return, less documented unpaid charges or damage");
  });

  it.each([RefundPolicyPage, ShippingPolicyPage])("keeps hardware reporting and valid defect claims consistent", (Page) => {
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(container).toHaveTextContent("3 calendar days of delivery or pickup");
    expect(container).toHaveTextContent("Reasonable opening and testing do not prevent a valid defect claim");
    expect(container).toHaveTextContent(/manufacturer warrant/i);
    expect(container).toHaveTextContent("Missing items do not require a return");
    expect(container).toHaveTextContent("We assess the claim against fulfilment and delivery records");
    expect(container).toHaveTextContent("If a refund is approved, we initiate it within 5 to 7 working days of approval");
    expect(container).not.toHaveTextContent("within 48 hours");
    expect(container).not.toHaveTextContent("Items must be unused");
  });

  it("distinguishes refund initiation from bank credit and keeps the returned-item deadline bounded", () => {
    const { container } = render(<MemoryRouter><RefundPolicyPage /></MemoryRouter>);
    expect(container).toHaveTextContent("within 5 to 7 working days of approval");
    expect(container).toHaveTextContent("not a promise of when your bank will show the credit");
    expect(container).toHaveTextContent("within 5 working days of receiving it");
    expect(container).toHaveTextContent("Deposit refund initiated within 7 working days of move-out");
    expect(container).not.toHaveTextContent("receiving and checking");
  });

  it.each([ContactPage, RefundPolicyPage])("acknowledges complaints promptly and defines the D+4 resolution deadline", (Page) => {
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(container).toHaveTextContent("within 1 business day");
    expect(container).toHaveTextContent("by D+4 business days, where D is the date we receive the complaint");
    expect(container).not.toHaveTextContent("within 30 days");
    expect(container).not.toHaveTextContent("within 48 hours");
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
