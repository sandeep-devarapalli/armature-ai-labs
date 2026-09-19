import { Check, Copy, Download, FileArchive, FileText } from "lucide-react";
import { useState } from "react";
import { Section } from "../components/Primitives";
import manifest from "../../public/brand/editorial-2026-09/manifest.json";
import "./BrandingPage.css";

const BRAND_BASE = "/brand/editorial-2026-09";
const oneLineDescription = manifest.copy.oneLine;
const paragraphDescription = manifest.copy.paragraph;
type BrandAsset = (typeof manifest.files)[number];
type AssetMode = "light" | "dark";
type CopyTarget = "one-line" | "paragraph";
type CopyState = { target: CopyTarget; result: "copied" | "failed" } | null;
const logos = [
  { kind: "lockup", title: "Horizontal lockup", use: "The default for website headers, email signatures and signage.", width: 1140 },
  { kind: "stacked", title: "Stacked lockup", use: "For vertical layouts, social graphics and print.", width: 1024 },
  { kind: "mark", title: "Circular symbol", use: "Use the supplied commutator where the lab name is already clear.", width: 512 },
  { kind: "wordmark", title: "Wordmark", use: "The exact name, Armature AI Labs, without the symbol.", width: 1800 },
  { kind: "icon", title: "App, profile and browser icons", use: "Square icons from 16 to 2048 px, including the 512 px app icon.", width: 512 }
];
const squareLogos = (["named", "icon"] as const).flatMap((kind) =>
  (["light", "dark", "black"] as const).map((variant) => ({
    title: `${kind === "named" ? "With name" : "Icon only"} · ${{ light: "white", dark: "charcoal", black: "pure black" }[variant]} background`,
    mode: variant === "light" ? "light" : "dark",
    asset: manifest.files.find((asset) => asset.name === `logos/${kind === "named" ? "square-named" : variant === "black" ? "square-icon" : "icon"}-${variant}-1024`)!
  }))
);
const platforms = [
  { id: "linkedin", title: "LinkedIn", note: "Company logo and cover, personal banner, and a 2× company-cover master." },
  { id: "x", title: "X / Twitter", note: "Profile icon and header. Check the live header crop before saving." },
  { id: "instagram", title: "Instagram", note: "Profile icon, square and portrait posts, and story artwork. Practical exports; check the in-app crop." },
  { id: "github", title: "GitHub", note: "Profile icon and repository social preview." },
  { id: "youtube", title: "YouTube", note: "Profile icon, channel banner with a conservative central safe area, and watermark." },
  { id: "discord", title: "Discord", note: "Server icon and a text-free banner. Banners require an eligible server; entitlement has not been checked." },
  { id: "whatsapp-business", title: "WhatsApp Business", note: "Business profile icon and status artwork. Practical exports; check the in-app crop." }
];
const brandColors = [
  { name: "Ink", hex: manifest.palettes.light.ink, use: "Light-surface lettering and marks" },
  { name: "White", hex: manifest.palettes.light.background, use: "Light surfaces and reversed artwork" },
  { name: "Secondary · light", hex: manifest.palettes.light.muted, use: "Supporting text on white" },
  { name: "Secondary · dark", hex: manifest.palettes.dark.muted, use: "Supporting text on near-black" }
];

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

function AssetLinks({ asset, label }: { asset: BrandAsset; label: string }) {
  return (
    <div className="branding-download-links">
      {(["png", "svg"] as const).map((format) => (
        <a key={format} href={BRAND_BASE + "/" + asset[format]} download={downloadName(asset[format])} aria-label={label + " · " + format.toUpperCase()}>
          <Download aria-hidden="true" />{format.toUpperCase()}
        </a>
      ))}
    </div>
  );
}

function variantKey(asset: BrandAsset) {
  return asset.width + "-" + ("transparent" in asset && asset.transparent ? "transparent" : "solid");
}

function LogoDownload({ logo, mode }: { logo: (typeof logos)[number]; mode: AssetMode }) {
  const options = manifest.files.filter((asset) => asset.kind === logo.kind && asset.mode === mode);
  const preferred = options.find((asset) => asset.width === logo.width) ?? options[0];
  const [selection, setSelection] = useState(variantKey(preferred));
  const asset = options.find((item) => variantKey(item) === selection) ?? preferred;
  return (
    <article className="branding-logo-row">
      <div className={"branding-logo-preview branding-surface-" + mode}>
        <img src={BRAND_BASE + "/" + asset.svg} alt={logo.title + " · " + mode + " surface"} loading="lazy" />
      </div>
      <div className="branding-logo-detail">
        <h3>{logo.title}</h3>
        <p>{logo.use}</p>
        <label>
          <span className="mono">Export size and background</span>
          <select value={variantKey(asset)} onChange={(event) => setSelection(event.target.value)} aria-label={logo.title + " export size"}>
            {options.map((option) => (
              <option key={option.name} value={variantKey(option)}>
                {option.width} × {option.height} px{"transparent" in option && option.transparent ? " · transparent" : " · solid"}
              </option>
            ))}
          </select>
        </label>
        <AssetLinks asset={asset} label={logo.title + " " + mode + " " + asset.width + " px"} />
      </div>
    </article>
  );
}

function socialLabel(asset: BrandAsset) {
  return asset.name.split("/").pop()!
    .replace(/-(light|dark)-/, "-")
    .replace(/-\d+(x\d+)?$/, "")
    .replaceAll("-", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function BrandingPage() {
  const [copyState, setCopyState] = useState<CopyState>(null);
  const [assetMode, setAssetMode] = useState<AssetMode>("light");
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
            <h1>Brand resources</h1>
            <p className="hero-copy">The circular mark, a precise wordmark, and the files to use them. Download logos and social artwork for light and dark surfaces.</p>
            <div className="button-row">
              <a className="button button-primary" href={BRAND_BASE + "/armature-ai-labs-editorial-complete.zip"} download="armature-ai-labs-editorial-complete.zip">
                <FileArchive aria-hidden="true" />Download complete pack
              </a>
              <a className="button button-quiet" href="#square-logos">Browse individual files</a>
            </div>
            <p className="branding-version mono">September 2026 · Brand resources</p>
          </div>
          <figure className="branding-hero-preview branding-surface-light">
            <img src={BRAND_BASE + "/logos/lockup-light-transparent-570.svg"} width="570" height="100" alt="Armature AI Labs horizontal lockup" />
            <figcaption>Armature AI Labs · circular symbol retained</figcaption>
          </figure>
        </div>
      </header>

      <Section number="01" title="About Armature AI Labs" lede="Ready-to-copy descriptions for publications, event listings and partner pages.">
        <div className="branding-copy-list">
          {([
            ["one-line", "One line", "Short description", oneLineDescription],
            ["paragraph", "One paragraph", "Full description", paragraphDescription]
          ] as const).map(([target, label, heading, description]) => (
            <article className="branding-copy-block" key={target}>
              <header>
                <div><span className="mono">{label}</span><h3>{heading}</h3></div>
                <button type="button" aria-label={target === "one-line" ? "Copy one-line description" : "Copy one-paragraph description"} onClick={() => void copyDescription(target, description)}>
                  {copyState?.target === target && copyState.result === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copyLabel(target)}
                </button>
              </header>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <p className="branding-copy-status" role="status" aria-live="polite">
          {copyState ? copyState.result === "copied" ? "Description copied to the clipboard." : "The description could not be copied. Select the text and copy it manually." : ""}
        </p>
      </Section>

      <Section id="square-logos" number="02" title="Square logos" lede="Ready for profiles, presentations and everyday work. Choose the name and symbol together, or the symbol on its own.">
        <div className="branding-square-grid">
          {squareLogos.map(({ title, mode, asset }) => (
            <article className="branding-square-card" key={asset.name}>
              <div className={"branding-square-preview branding-surface-" + mode}>
                <img src={BRAND_BASE + "/" + asset.svg} width={asset.width} height={asset.height} loading="lazy" alt={"Armature AI Labs · " + title} />
              </div>
              <h3>{title}</h3>
              <p>1024 × 1024 px · solid background</p>
              <AssetLinks asset={asset} label={"Square logo " + title} />
            </article>
          ))}
        </div>
      </Section>

      <Section id="logo-system" number="03" title="Logo system" lede="PNG for everyday use. Outlined SVG for sharp, scalable artwork without a font dependency.">
        <div className="branding-toolbar">
          <div className="branding-mode" role="group" aria-label="Asset background">
            {(["light", "dark"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={assetMode === mode} onClick={() => setAssetMode(mode)}>For {mode} surfaces</button>
            ))}
          </div>
          <a href={BRAND_BASE + "/armature-ai-labs-editorial-logos.zip"} download="armature-ai-labs-editorial-logos.zip"><FileArchive aria-hidden="true" />All logo files</a>
        </div>
        <div className="branding-logo-list">
          {logos.map((logo) => <LogoDownload key={logo.kind} logo={logo} mode={assetMode} />)}
        </div>
      </Section>

      <Section id="social-assets" number="04" title="Social assets" lede="One identity across seven platforms. Choose PNG when uploading; SVG is included for reuse in artwork.">
        <div className="branding-toolbar">
          <div className="branding-mode" role="group" aria-label="Social asset background">
            {(["light", "dark"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={assetMode === mode} onClick={() => setAssetMode(mode)}>For {mode} surfaces</button>
            ))}
          </div>
          <a href={BRAND_BASE + "/armature-ai-labs-editorial-social.zip"} download="armature-ai-labs-editorial-social.zip"><FileArchive aria-hidden="true" />All social files</a>
        </div>
        <div className="branding-social-grid">
          {platforms.map((platform) => {
            const assets = manifest.files.filter((asset) => "platform" in asset && asset.platform === platform.id && asset.mode === assetMode);
            const preview = assets.find((asset) => asset.kind !== "social-profile") ?? assets[0];
            return (
              <article className="branding-social-card" key={platform.id}>
                <div className={"branding-social-preview branding-surface-" + assetMode}>
                  <img src={BRAND_BASE + "/" + preview.png} width={preview.width} height={preview.height} loading="lazy" alt={platform.title + " " + socialLabel(preview) + " · " + assetMode} />
                </div>
                <h3>{platform.title}</h3>
                <p>{platform.note}</p>
                <ul className="branding-social-files">
                  {assets.map((asset) => (
                    <li key={asset.name}>
                      <div><span>{socialLabel(asset)}</span><small>{asset.width} × {asset.height} px</small></div>
                      <AssetLinks asset={asset} label={platform.title + " " + socialLabel(asset) + " " + assetMode} />
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
        <p className="branding-file-note">Files have not been uploaded to social accounts. Crop behaviour varies by surface; <a href={BRAND_BASE + "/README.md"} download="armature-ai-labs-brand-guide.md">see the export guide and source specifications</a>.</p>
      </Section>

      <Section number="05" title="Use the identity consistently" lede="Write Armature AI Labs. Keep the circular geometry unchanged, and choose the supplied version for its background.">
        <div className="branding-guideline-grid">
          <article>
            <h3>Give it space</h3>
            <ul>
              <li>Use the symbol at 24 px or larger when practical; tiny browser icons have dedicated exports.</li>
              <li>Keep horizontal lockups at least 190 px wide.</li>
              <li>Leave one central-shaft diameter around the mark, or half the wordmark capital height around a lockup.</li>
              <li>Use dark lettering on light surfaces and white lettering on dark surfaces.</li>
            </ul>
          </article>
          <article>
            <h3>Keep it recognizable</h3>
            <ul>
              <li>Do not rotate, stretch, redraw or change the eight segments.</li>
              <li>Do not add gradients, shadows, outlines or extra colours.</li>
              <li>Retain the exact capitals: Armature AI Labs.</li>
              <li>Use the supplied outlined wordmark instead of substituting another font.</li>
            </ul>
          </article>
        </div>
        <div className="branding-type">
          <h3>Helvetica Neue + Space Mono</h3>
          <p>Helvetica Neue Bold sets the wordmark and headings. Space Mono carries supporting copy and labels. Primary SVGs have outlined lettering; editable SVGs require a locally licensed Helvetica Neue. Helvetica font files are not redistributed. Space Mono and its OFL are included.</p>
        </div>
        <div className="branding-color-grid" aria-label="Armature AI Labs brand colours">
          {brandColors.map((color) => (
            <article key={color.name}>
              <span className="branding-color-swatch" style={{ backgroundColor: color.hex }} aria-hidden="true" />
              <div><h3>{color.name}</h3><code>{color.hex}</code><p>{color.use}</p></div>
            </article>
          ))}
        </div>
      </Section>

      <Section number="06" title="Usage and permissions" lede="The repository's Apache-2.0 license covers source code and documentation, not the Armature AI Labs identity assets.">
        <div className="branding-permissions">
          <div>
            <p>Reasonable use of the name and marks to identify this project, link to it, or describe the origin of an unmodified copy is permitted. Any other use requires prior written permission.</p>
            <p>Do not imply endorsement, affiliation, or operation of an official Armature AI Labs facility without permission.</p>
            <p>Request written permission at <a className="text-link" href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a>.</p>
          </div>
          <a className="button button-quiet" href={BRAND_BASE + "/USAGE-AND-PERMISSIONS.md"} download="armature-ai-labs-usage-and-permissions.md"><FileText aria-hidden="true" />Download usage note</a>
        </div>
      </Section>
    </div>
  );
}
