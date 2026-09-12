import { Check, Copy, Download, FileArchive, FileText } from "lucide-react";
import { useState } from "react";
import { Section } from "../components/Primitives";
import "./BrandingPage.css";

const BRAND_BASE = "/brand/armature-ai-labs";
const COMPLETE_PACK = "/brand/armature-ai-labs-assets.zip";
const oneLineDescription =
  "Armature AI Labs is a maker space in HSR Layout, Bengaluru, built for people making physical things with AI.";
const paragraphDescription =
  "Armature AI Labs is a maker space in HSR Layout, Bengaluru, built for people making physical things with AI. Robotics and hardware teams take desks and cabins here, and there is a shared lab with robot arms, GPUs, and Jetson edge kits down the hall, so you can go from idea to working prototype without buying a lab of your own.";
type AssetDownload = { label: string; path: string };
type LogoAsset = { title: string; use: string; preview: string; alt: string; downloads: AssetDownload[] };
const logoAssets: LogoAsset[] = [
  {
    title: "Horizontal lockup",
    use: "The default for website headers, email signatures and signage.",
    preview: "svg/armature-ai-labs-lockup-h.svg",
    alt: "Horizontal Armature AI Labs logo",
    downloads: [
      { label: "SVG · transparent", path: "svg/armature-ai-labs-lockup-h.svg" },
      { label: "SVG · dark surface", path: "svg/armature-ai-labs-lockup-h-on-ink.svg" },
      { label: "PNG · transparent · 2×", path: "png/armature-ai-labs-lockup-h-transparent-2x.png" },
      { label: "PNG · dark surface · 2×", path: "png/armature-ai-labs-lockup-h-on-ink-2x.png" }
    ]
  },
  {
    title: "Vertical lockup",
    use: "For stacked layouts, social graphics, print and the front door.",
    preview: "svg/armature-ai-labs-lockup-v.svg",
    alt: "Vertical Armature AI Labs logo",
    downloads: [
      { label: "SVG · transparent", path: "svg/armature-ai-labs-lockup-v.svg" },
      { label: "SVG · dark surface", path: "svg/armature-ai-labs-lockup-v-on-ink.svg" },
      { label: "SVG · saffron surface", path: "svg/armature-ai-labs-lockup-v-on-saffron.svg" },
      { label: "PNG · transparent · 2×", path: "png/armature-ai-labs-lockup-v-transparent-2x.png" }
    ]
  },
  {
    title: "Commutator mark",
    use: "Use the symbol alone where the Armature AI Labs name is already clear.",
    preview: "svg/armature-ai-labs-mark.svg",
    alt: "Armature AI Labs commutator mark",
    downloads: [
      { label: "SVG · transparent", path: "svg/armature-ai-labs-mark.svg" },
      { label: "SVG · dark surface", path: "svg/armature-ai-labs-mark-cream.svg" },
      { label: "PNG · 1024 px", path: "png/armature-ai-labs-mark-1024.png" },
      { label: "PNG · dark surface · 1024 px", path: "png/armature-ai-labs-mark-cream-1024.png" }
    ]
  },
  {
    title: "Wordmark",
    use: "Use the name without the mark only when space is constrained.",
    preview: "svg/armature-ai-labs-wordmark.svg",
    alt: "Armature AI Labs wordmark",
    downloads: [
      { label: "SVG · transparent", path: "svg/armature-ai-labs-wordmark.svg" },
      { label: "SVG · dark surface", path: "svg/armature-ai-labs-wordmark-cream.svg" },
      { label: "PNG · transparent · 2×", path: "png/armature-ai-labs-wordmark-2x.png" },
      { label: "SVG · black", path: "svg/bw/armature-ai-labs-wordmark-black.svg" }
    ]
  }
];
const iconAssets = [
  {
    title: "App and social icon",
    detail: "1024 × 1024 PNG",
    preview: "png/armature-ai-labs-icon-1024.png",
    downloads: [
      { label: "1024 px", path: "png/armature-ai-labs-icon-1024.png" },
      { label: "512 px", path: "png/armature-ai-labs-icon-512.png" },
      { label: "180 px", path: "png/armature-ai-labs-icon-180.png" }
    ]
  },
  {
    title: "Paper app icon",
    detail: "512 × 512 PNG",
    preview: "png/armature-ai-labs-icon-paper-512.png",
    downloads: [
      { label: "512 px", path: "png/armature-ai-labs-icon-paper-512.png" },
      { label: "SVG · paper", path: "svg/armature-ai-labs-icon-paper.svg" },
      { label: "SVG · ink", path: "svg/armature-ai-labs-icon-ink.svg" }
    ]
  },
  {
    title: "Browser icon",
    detail: "SVG, PNG and ICO",
    preview: "svg/armature-ai-labs-favicon.svg",
    downloads: [
      { label: "SVG", path: "svg/armature-ai-labs-favicon.svg" },
      { label: "32 px PNG", path: "png/favicon-32.png" },
      { label: "16 px PNG", path: "png/favicon-16.png" },
      { label: "ICO", path: "png/favicon.ico" }
    ]
  }
] as const;
const brandColors = [
  { name: "Ink", hex: "#0A1220", use: "Primary text and mono marks" },
  { name: "Paper", hex: "#FFFEFA", use: "Primary light surface" },
  { name: "Cream", hex: "#F2E6CC", use: "Mark and wordmark on ink" },
  { name: "Saffron", hex: "#E89A2C", use: "The two live segments only" }
] as const;
type CopyTarget = "one-line" | "paragraph";
type CopyState = { target: CopyTarget; result: "copied" | "failed" } | null;
function downloadName(path: string) {
  return path.split("/").pop();
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard write failed");
  }
}

function DownloadLinks({ downloads }: { downloads: readonly AssetDownload[] }) {
  return (
    <div className="branding-download-links">
      {downloads.map((asset) => (
        <a key={asset.path} href={`${BRAND_BASE}/${asset.path}`} download={downloadName(asset.path)}>
          <Download aria-hidden="true" />
          {asset.label}
        </a>
      ))}
    </div>
  );
}
export function BrandingPage() {
  const [copyState, setCopyState] = useState<CopyState>(null);
  async function copyDescription(target: CopyTarget, text: string) {
    try {
      await writeClipboard(text);
      setCopyState({ target, result: "copied" });
    } catch {
      setCopyState({ target, result: "failed" });
    }
  }
  function copyLabel(target: CopyTarget) {
    if (copyState?.target !== target) return "Copy text";
    return copyState.result === "copied" ? "Copied" : "Copy failed";
  }
  return (
    <div className="branding-page">
      <header className="branding-hero">
        <div className="wrap branding-hero-grid">
          <div className="branding-hero-copy">
            <div className="eyebrow mono">Armature AI Labs · brand resources</div>
            <h1>Brand resources</h1>
            <p className="hero-copy">
              Download the approved Armature AI Labs logos, app icons and browser
              assets, then use them with the spacing, colour and permission
              guidance below.
            </p>
            <div className="button-row">
              <a className="button button-primary" href={COMPLETE_PACK} download="armature-ai-labs-assets.zip">
                <FileArchive aria-hidden="true" />
                Download complete pack
              </a>
              <a className="button button-quiet" href="#logo-system">
                Browse individual files
              </a>
            </div>
          </div>
          <figure className="branding-hero-preview">
            <img src={`${BRAND_BASE}/svg/armature-ai-labs-lockup-h-on-paper.svg`} alt="Horizontal Armature AI Labs lockup" />
            <figcaption className="mono">Primary lockup · on paper</figcaption>
          </figure>
        </div>
      </header>

      <Section
        number="01"
        title="About Armature AI Labs"
        lede="Use this approved copy when a publication, event listing or partner page needs a short lab description."
      >
        <div className="branding-copy-list">
          <article className="branding-copy-block">
            <header>
              <div>
                <span className="mono">One line</span>
                <h3>Short description</h3>
              </div>
              <button
                type="button"
                aria-label="Copy one-line description"
                onClick={() => void copyDescription("one-line", oneLineDescription)}
              >
                {copyState?.target === "one-line" && copyState.result === "copied" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {copyLabel("one-line")}
              </button>
            </header>
            <p>{oneLineDescription}</p>
          </article>
          <article className="branding-copy-block">
            <header>
              <div>
                <span className="mono">One paragraph</span>
                <h3>Full description</h3>
              </div>
              <button
                type="button"
                aria-label="Copy one-paragraph description"
                onClick={() => void copyDescription("paragraph", paragraphDescription)}
              >
                {copyState?.target === "paragraph" && copyState.result === "copied" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {copyLabel("paragraph")}
              </button>
            </header>
            <p>{paragraphDescription}</p>
          </article>
        </div>
        <p className="branding-copy-status" role="status" aria-live="polite">
          {copyState
            ? copyState.result === "copied"
              ? "Description copied to the clipboard."
              : "The description could not be copied. Select the text and copy it manually."
            : ""}
        </p>
      </Section>

      <Section
        id="logo-system"
        number="02"
        title="Logo system"
        lede="SVG is the source of truth. Use PNG exports when the destination cannot accept vector artwork."
        dark
      >
        <div className="branding-logo-list">
          {logoAssets.map((asset) => (
            <article className="branding-logo-row" key={asset.title}>
              <div className="branding-logo-preview">
                <img
                  src={`${BRAND_BASE}/${asset.preview}`}
                  alt={asset.alt}
                  loading="lazy"
                />
              </div>
              <div className="branding-logo-detail">
                <h3>{asset.title}</h3>
                <p>{asset.use}</p>
                <DownloadLinks downloads={asset.downloads} />
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        number="03"
        title="Icons and favicons"
        lede="Square app and social tiles are available at common production sizes, with a separate browser-icon set."
      >
        <div className="branding-icon-grid">
          {iconAssets.map((asset) => (
            <article className="branding-icon-card" key={asset.title}>
              <div className="branding-icon-preview">
                <img
                  src={`${BRAND_BASE}/${asset.preview}`}
                  alt={`${asset.title} preview`}
                  loading="lazy"
                />
              </div>
              <div>
                <h3>{asset.title}</h3>
                <p>{asset.detail}</p>
                <DownloadLinks downloads={asset.downloads} />
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        number="04"
        title="Use the identity consistently"
        lede="The commutator geometry and the lowercase wordmark are fixed. Choose the supplied variant that fits the surface."
      >
        <div className="branding-guideline-grid">
          <article>
            <span className="mono">Do</span>
            <ul>
              <li>Keep the mark at least 16 px high.</li>
              <li>Keep the horizontal lockup at least 120 px wide.</li>
              <li>Leave clear space equal to one quarter of the mark height.</li>
              <li>Use the all-ink version on a saffron background.</li>
              <li>Use cream artwork on dark ink surfaces.</li>
            </ul>
          </article>
          <article>
            <span className="mono">Do not</span>
            <ul>
              <li>Rotate the mark; the live segments stay at 3 and 9 o'clock.</li>
              <li>Change the number, shape or spacing of the eight segments.</li>
              <li>Add outlines, gradients, shadows or extra colours.</li>
              <li>Place saffron live segments on a saffron field.</li>
              <li>Capitalize or re-typeset the outlined lowercase wordmark.</li>
            </ul>
          </article>
        </div>

        <div className="branding-color-grid" aria-label="Armature AI Labs brand colours">
          {brandColors.map((color) => (
            <article key={color.name}>
              <span
                className="branding-color-swatch"
                style={{ backgroundColor: color.hex }}
                aria-hidden="true"
              />
              <div>
                <h3>{color.name}</h3>
                <code>{color.hex}</code>
                <p>{color.use}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        number="05"
        title="Usage and permissions"
        lede="The repository's Apache-2.0 license covers source code and documentation, not the Armature AI Labs identity assets."
        dark
      >
        <div className="branding-permissions">
          <div>
            <p>
              Reasonable use of the name and marks to identify this project,
              link to it, or describe the origin of an unmodified copy is
              permitted. Any other use requires prior written permission.
            </p>
            <p>
              Do not imply endorsement, affiliation, or operation of an
              official Armature AI Labs facility without permission.
            </p>
            <p>
              Request written permission at <a className="text-link" href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a>.
            </p>
          </div>
          <a
            className="button button-quiet"
            href={`${BRAND_BASE}/USAGE-AND-PERMISSIONS.md`}
            download="armature-ai-labs-usage-and-permissions.md"
          >
            <FileText aria-hidden="true" />
            Download usage note
          </a>
        </div>
      </Section>
    </div>
  );
}
