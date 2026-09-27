import { basicOnboardingAvailable } from "../config/release";
import { components } from "../data/components";

export const SITE_URL = "https://armatureailabs.com";
const SITE_NAME = "Armature AI Labs";
const SOCIAL_IMAGE = `${SITE_URL}/brand/editorial-2026-09/social/linkedin/link-preview-dark-1200x627.png`;

type JsonLd = Record<string, unknown>;
type PageDefinition = { name: string; description: string; parent?: string };

export type PageSeo = {
  title: string;
  description: string;
  indexable: boolean;
  robots: string;
  canonical?: string;
  type: "website" | "article";
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  structuredData?: JsonLd;
};

const pages: Record<string, PageDefinition> = {
  "/": {
    name: "Physical AI and Robotics Lab in Bengaluru",
    description: "Armature AI Labs is a planned 3,500 sq ft physical AI and robotics lab in HSR Layout, Bengaluru. Explore the designs, projects and lab journal."
  },
  "/privacy/": {
    name: "Privacy",
    description: "How Armature AI Labs handles website visits, browser storage and enquiries, how to contact us about your information, and how free membership registration and private identity review work."
  },
  "/about/": {
    name: "Who We Are",
    description: "Armature AI Labs is a makers’ lab for learning, building and sharing physical AI and robotics in Bengaluru."
  },
  "/services/": {
    name: "Engineering Services and Programs",
    description: "Explore proposed robotics, prototyping, physical AI and engineering programs at Armature AI Labs. Pre-launch enquiries are welcome."
  },
  "/projects/": {
    name: "Robotics and Physical AI Projects",
    description: "Browse the Armature AI Labs project library: robotics, embedded systems, fabrication and physical AI, with source links and build-planning context."
  },
  "/branding/": {
    name: "Brand Assets and Guidelines",
    description: "Download Armature AI Labs logos in SVG and PNG, light and dark variants, social assets and approved descriptions, with clear brand-use guidelines."
  },
  "/blog/": {
    name: "The Lab Journal",
    description: "Notes from Armature AI Labs on physical AI, shared hardware interfaces, engineering experiments and the work of building embodied systems."
  },
  "/blog/model-hardware-standard/": {
    name: "MHS could be physical AI’s MCP moment.",
    description: "How Anthropic’s Model Hardware Standard could connect engineering AI to physical tests—and why repeatability, traceable evidence and safety still matter.",
    parent: "/blog/"
  },
  "/projects/electrofluidic-fiber-muscles/": {
    name: "Electrofluidic Fiber Muscles",
    description: "Explore Armature AI Labs’ proposed electrofluidic muscle replication track, with primary research sources, staged experiments and explicit safety gates.",
    parent: "/projects/"
  },
  "/building-vision/": {
    name: "HSR 1490 Building Vision",
    description: "Explore the ground- and first-floor designs for Armature AI Labs HSR 1490, including Blender views, CAD downloads and labelled planning assumptions."
  },
  "/ecosystem/": {
    name: "Bengaluru Robotics Ecosystem",
    description: "Explore a source-linked directory of Bengaluru robotics companies, research labs and learning spaces, with evidence and location notes."
  },
  "/components/": {
    name: "Component Reference Catalog",
    description: "Browse project-linked controllers, sensors, motion parts and compute references. Availability and vendor prices are dated snapshots, not live stock or quotes."
  },
  "/maker-desk/": {
    name: "Maker Desk Plans",
    description: "Explore Armature AI Labs’ planned lockers, small-parts and portable-toolkit services. Confirm launch timing and availability with the lab before making plans."
  },
  "/join/": {
    name: "Membership Enquiries",
    description: "Contact Armature AI Labs about membership, team space and future events in HSR Layout, Bengaluru. The lab is pre-launch; online bookings are not open."
  }
};

for (const component of components) {
  pages[`/components/${component.slug}/`] = {
    name: `${component.name} | Component Reference`,
    description: `${component.name}: project-linked ${component.category.toLowerCase()} reference, validation notes and dated sourcing information—not a live stock listing.`,
    parent: "/components/"
  };
}

export const publicSeoPaths = Object.keys(pages);

const organization: JsonLd = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  description: pages["/"].description,
  logo: `${SITE_URL}/brand/editorial-2026-09/logos/icon-light-512.png`,
  email: "hello@armatureailabs.com",
  telephone: "+919748485583",
  address: {
    "@type": "PostalAddress",
    streetAddress: "1490, 11th Cross, 20th Main, 1st Sector, HSR Layout",
    addressLocality: "Bengaluru",
    addressRegion: "Karnataka",
    postalCode: "560034",
    addressCountry: "IN"
  },
  sameAs: ["https://www.linkedin.com/company/armature-ai-labs/"]
};

const operationalNames: Record<string, string> = {
  onboarding: "Basic Membership", auth: "Sign In", dashboard: "Member Dashboard", profile: "Member Profile",
  book: "Resource Booking", bookings: "Bookings", "check-in": "Check In",
  "component-requests": "Component Requests", inventory: "Inventory",
  team: "Meet the Team",
  lockers: "Lockers", consumables: "Small Parts", toolkits: "Toolkits",
  admin: "Administration", kiosk: "Check-In Kiosk", financials: "Financial Planning",
  members: "Member Directory"
};

export function getPageSeo(pathname: string): PageSeo {
  const cleanPath = pathname.split(/[?#]/, 1)[0];
  const path = cleanPath === "/" ? "/" : `${cleanPath.replace(/\/+$/, "")}/`;
  const page = path === "/join/" && basicOnboardingAvailable
    ? { name: "Basic Membership", description: "Register for free with Armature AI Labs in HSR Layout, Bengaluru. Complete private identity review; paid coworking, equipment and event bookings remain closed." }
    : Object.hasOwn(pages, path) ? pages[path] : undefined;
  if (!page) {
    const segment = path.split("/")[1];
    const name = path === "/components/request/" ? "Component Request"
      : Object.hasOwn(operationalNames, segment) ? operationalNames[segment] : "Page Not Found";
    return {
      title: `${name} | ${SITE_NAME}`,
      description: "This page is not part of the public search index. Explore the public lab website or contact hello@armatureailabs.com for information.",
      indexable: false,
      robots: "noindex, follow",
      type: "website",
      image: SOCIAL_IMAGE,
      imageAlt: "Armature AI Labs — The Physical AI and Robotics Lab, HSR Layout, Bengaluru",
      imageWidth: 1200, imageHeight: 627
    };
  }

  const canonical = `${SITE_URL}${path}`;
  const article = path === "/blog/model-hardware-standard/";
  const image = article ? `${SITE_URL}/blog-covers/mhs-common-interface.png`
    : path === "/about/" ? `${SITE_URL}/about/who-we-are-social.png` : SOCIAL_IMAGE;
  const imageAlt = article ? "Abstract instruments aligned around a shared connector"
    : path === "/about/" ? "Concept illustration of a shared physical AI lab"
      : "Armature AI Labs — The Physical AI and Robotics Lab, HSR Layout, Bengaluru";
  const imageWidth = article ? 1672 : 1200;
  const imageHeight = article ? 941 : path === "/about/" ? 630 : 627;
  const graph: JsonLd[] = [organization, {
    "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`,
    name: SITE_NAME, publisher: { "@id": organization["@id"] }, inLanguage: "en"
  }, {
    "@type": "WebPage", "@id": `${canonical}#webpage`, url: canonical,
    name: page.name, description: page.description,
    isPartOf: { "@id": `${SITE_URL}/#website` }, about: { "@id": organization["@id"] }, inLanguage: "en"
  }];
  if (path !== "/") {
    const ancestors = ["/", ...(page.parent ? [page.parent] : []), path];
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: ancestors.map((item, index) => ({
        "@type": "ListItem", position: index + 1,
        name: item === "/" ? "Home" : pages[item].name, item: `${SITE_URL}${item}`
      }))
    });
  }
  if (article) graph.push({
    "@type": "BlogPosting", "@id": `${canonical}#article`,
    headline: page.name, description: page.description,
    image: { "@type": "ImageObject", url: image, width: imageWidth, height: imageHeight },
    mainEntityOfPage: { "@id": `${canonical}#webpage` },
    author: { "@id": organization["@id"] }, publisher: { "@id": organization["@id"] },
    datePublished: "2026-09-13", dateModified: "2026-09-17", inLanguage: "en"
  });
  return {
    title: `${page.name} | ${SITE_NAME}`, description: page.description,
    canonical, indexable: true, robots: "index, follow, max-image-preview:large",
    type: article ? "article" : "website", image,
    imageAlt, imageWidth, imageHeight,
    structuredData: { "@context": "https://schema.org", "@graph": graph }
  };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]!);

export function renderSeoHead(page: PageSeo): string {
  const meta = (attribute: "name" | "property", key: string, value: string) =>
    `<meta data-seo ${attribute}="${key}" content="${escapeHtml(value)}">`;
  return [
    `<title data-seo>${escapeHtml(page.title)}</title>`,
    meta("name", "description", page.description), meta("name", "robots", page.robots),
    ...(page.canonical ? [`<link data-seo rel="canonical" href="${escapeHtml(page.canonical)}">`] : []),
    meta("property", "og:title", page.title), meta("property", "og:description", page.description),
    meta("property", "og:type", page.type), meta("property", "og:site_name", SITE_NAME),
    ...(page.canonical ? [meta("property", "og:url", page.canonical)] : []),
    meta("property", "og:image", page.image), meta("property", "og:image:width", String(page.imageWidth)),
    meta("property", "og:image:height", String(page.imageHeight)), meta("property", "og:image:alt", page.imageAlt),
    meta("name", "twitter:card", "summary_large_image"), meta("name", "twitter:title", page.title),
    meta("name", "twitter:description", page.description), meta("name", "twitter:image", page.image),
    meta("name", "twitter:image:alt", page.imageAlt),
    ...(page.structuredData ? [`<script data-seo type="application/ld+json">${JSON.stringify(page.structuredData).replace(/</g, "\\u003c")}</script>`] : [])
  ].join("\n");
}
