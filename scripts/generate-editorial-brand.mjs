import { readFile, writeFile, mkdir, copyFile, readdir, stat, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pack = path.join(root, 'brand/armature-ai-labs/editorial-2026-09');
const publicPack = path.join(root, 'public/brand/editorial-2026-09');
const preview = path.resolve(root, '../lambda-style-web-preview-2026-09-13/public');
const exists = async target => { try { await access(target); return true; } catch { return false; } };
const sourceMark = await exists(path.join(pack, 'source/approved-circular-mark.svg')) ? path.join(pack, 'source/approved-circular-mark.svg') : path.join(preview, 'brand/armature-symbol.svg');
const rawMark = await readFile(sourceMark, 'utf8');
const markBody = rawMark.replace(/<svg[^>]*>|<\/svg>|<title>.*?<\/title>/g, '');
const sourceHash = createHash('sha256').update(rawMark).digest('hex');
if (sourceHash !== 'dd6fc3ee758f43d7c04dec9f4e7a9db39b10b7c912fa6a6ce20b02596bfc0841') {
  throw new Error('Approved circular-mark source changed; inspect before exporting.');
}
const theme = { light: { background: '#ffffff', ink: '#111110', muted: '#6b6862', rule: '#d8d8d5' }, dark: { background: '#111110', ink: '#ffffff', muted: '#bcbcb7', rule: '#393936' } };
const copy = {
  name: 'Armature AI Labs',
  tagline: 'The Physical AI and Robotics Lab',
  location: 'HSR Layout, Bengaluru',
  website: 'armatureailabs.com',
  email: 'hello@armatureailabs.com',
  oneLine: 'Armature AI Labs is a 3,500 sq ft physical AI and robotics lab in HSR Layout, Bengaluru.',
  paragraph: 'The armature is the core of every motor: the part that moves. Armature AI Labs is a 3,500 sq ft physical AI and robotics lab across ground and first floors in HSR Layout, Bengaluru, built for the full path from idea to working machine: arms, prototyping, machining, ESD-safe benches, and GPU compute.',
  headlineA: 'A place to build',
  headlineB: 'physical intelligence.'
};
const fontDirectory = await exists(path.join(pack, 'fonts/SpaceMono-Regular.ttf')) ? path.join(pack, 'fonts') : path.join(preview, 'fonts');
const fontPath = path.join(fontDirectory, 'SpaceMono-Regular.ttf');
const requests = [
  { id: 'wordmark', text: copy.name, font: 'HelveticaNeue-Bold', size: 50, tracking: -1.9 },
  ...['tagline', 'location', 'website', 'email'].map(id => ({ id, text: copy[id], font: 'SpaceMono-Regular', size: 24, tracking: 0 })),
  ...['headlineA', 'headlineB'].map(id => ({ id, text: copy[id], font: 'HelveticaNeue-Bold', size: 80, tracking: -2.8 }))
];
const outlines = JSON.parse(execFileSync('/usr/bin/swift', [path.join(root, 'scripts/generate-editorial-brand.swift'), fontPath], {
  input: JSON.stringify(requests), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  env: { ...process.env, CLANG_MODULE_CACHE_PATH: '/tmp/armature-brand-clang-cache', SWIFT_MODULE_CACHE_PATH: '/tmp/armature-brand-swift-cache' }
}));
if (outlines.wordmark.resolvedFont !== 'HelveticaNeue-Bold' || outlines.tagline.resolvedFont !== 'SpaceMono-Regular') throw new Error('Expected fonts unavailable.');
const esc = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const svg = (width, height, body, label = copy.name) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${esc(label)}</title>${body}</svg>`;
const background = (w, h, color) => color ? `<rect width="${w}" height="${h}" fill="${color}"/>` : '';
const mark = (x, y, size, ink) => `<g transform="translate(${x} ${y}) scale(${size / 100})">${markBody.replaceAll('#0A1220', ink)}</g>`;
const lettering = (id, x, baseline, size, ink, center = false) => {
  const refSize = requests.find(item => item.id === id).size;
  const scale = size / refSize;
  return `<path fill="${ink}" transform="translate(${x - (center ? outlines[id].width * scale / 2 : 0)} ${baseline}) scale(${scale})" d="${outlines[id].path}"/>`;
};
const lockup = (x, y, width, ink) => `<g transform="translate(${x} ${y}) scale(${width / 570})">${mark(0, 0, 100, ink)}${lettering('wordmark', 112, 66, 50, ink)}</g>`;
const rule = (x1, y, x2, color) => `<path d="M${x1} ${y}H${x2}" fill="none" stroke="${color}"/>`;
const records = [];
async function emit(relative, data) {
  const target = path.join(pack, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return target;
}
async function asset(name, width, height, body, details = {}) {
  const content = svg(width, height, body, details.label ?? copy.name);
  await emit(`${name}.svg`, content);
  const png = await sharp(Buffer.from(content)).png({ compressionLevel: 9 }).toBuffer();
  await emit(`${name}.png`, png);
  const metadata = await sharp(png).metadata();
  if (metadata.width !== width || metadata.height !== height) throw new Error(`Incorrect export dimensions: ${name}`);
  records.push({ name, width, height, bytes: png.length, png: `${name}.png`, svg: `${name}.svg`, sha256: createHash('sha256').update(png).digest('hex'), ...details });
}
const sources = {
  linkedinCompany: { url: 'https://www.linkedin.com/help/linkedin/answer/a563309', dimensions: 'Company logo 400×400; Page cover 1512×256; custom post-link preview 1200×627; 3 MB maximum. Direct page supersedes cached 4200×700 snippets.' },
  linkedinPersonal: { url: 'https://www.linkedin.com/help/linkedin/answer/a568217/adding-or-changing-the-background-photo-on-your-profile?lang=en', dimensions: 'Personal cover 1584×396; under 8 MB.' },
  x: { url: 'https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo', dimensions: 'Profile 400×400; header 1500×500; profile maximum 2 MB. Top and bottom 60 px may be cropped.' },
  youtube: { url: 'https://support.google.com/youtube/answer/10456525?hl=en', dimensions: 'Banner 2560×1440 recommended; 2048×1152 minimum; safe text/logo area 1235×338 at minimum size; 6 MB maximum. Watermark minimum 150×150 and under 1 MB.' },
  github: { url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview', dimensions: 'Repository social preview 1280×640 recommended; under 1 MB.' },
  discord: { url: 'https://support.discord.com/hc/en-us/articles/360028716472-Server-Banners', dimensions: 'Server banner 960×540; keep top 48 px simple; avoid text and logos. Requires eligible boosted/partner server.' }
};
for (const [mode, color] of Object.entries(theme)) {
  for (const size of [16, 32, 48, 180, 192, 256, 400, 512, 800, 1024, 2048]) {
    await asset(`logos/icon-${mode}-${size}`, size, size, background(size, size, color.background) + mark(size * .1, size * .1, size * .8, color.ink), { kind: 'icon', mode });
    if (size >= 256) await asset(`logos/mark-${mode}-transparent-${size}`, size, size, mark(0, 0, size, color.ink), { kind: 'mark', mode, transparent: true });
  }
  for (const width of [570, 1140, 2280]) {
    const height = width * 100 / 570;
    for (const transparent of [true, false]) {
      await asset(`logos/lockup-${mode}-${transparent ? 'transparent' : 'solid'}-${width}`, width, height, background(width, height, transparent ? null : color.background) + lockup(0, 0, width, color.ink), { kind: 'lockup', mode, transparent });
    }
  }
  await asset(`logos/wordmark-${mode}-transparent-1800`, 1800, 250, lettering('wordmark', 35, 180, 200, color.ink), { kind: 'wordmark', mode, transparent: true });
  await asset(`logos/stacked-${mode}-1024`, 1024, 768, background(1024, 768, color.background) + mark(352, 80, 320, color.ink) + lettering('wordmark', 512, 540, 96, color.ink, true) + lettering('tagline', 512, 614, 21, color.muted, true), { kind: 'stacked', mode });
  await asset(`logos/square-named-${mode}-1024`, 1024, 1024, background(1024, 1024, color.background) + `<g transform="translate(0 128)">${mark(352, 80, 320, color.ink)}${lettering('wordmark', 512, 540, 96, color.ink, true)}${lettering('tagline', 512, 614, 21, color.muted, true)}</g>`, { kind: 'square-named', mode });
  const editable = rawMark.replace(/<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" width="570" height="100" viewBox="0 0 570 100">').replace('<title>Armature AI Labs mark</title>', '<title>Armature AI Labs — editable wordmark</title>').replaceAll('#0A1220', color.ink).replace('</svg>', `<text x="112" y="66" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="50" font-weight="700" letter-spacing="-1.9" fill="${color.ink}">Armature AI Labs</text></svg>`);
  await emit(`editable/lockup-${mode}.svg`, editable);
}

function cover(width, height, mode, personal = false) {
  const c = theme[mode];
  const logoWidth = Math.min(width * .68, height * 3.55);
  const center = width * (personal ? .62 : .56);
  return background(width, height, c.background) + lockup(center - logoWidth / 2, height * .16, logoWidth, c.ink)
    + lettering('tagline', center, height * .71, Math.min(25, height * .069), c.muted, true)
    + lettering('website', center, height * .85, Math.min(22, height * .057), c.muted, true);
}
function editorial(width, height, mode) {
  const c = theme[mode];
  const m = width * .075;
  const headlineSize = width * .074;
  return background(width, height, c.background) + lockup(m, height * .12, width * .63, c.ink)
    + lettering('headlineA', m, height * .45, headlineSize, c.ink)
    + lettering('headlineB', m, height * .45 + headlineSize * 1.1, headlineSize, c.ink)
    + lettering('location', m, height * .7, width * .023, c.muted)
    + rule(m, height * .79, width - m, c.rule)
    + lettering('website', m, height * .85, width * .023, c.ink);
}
for (const mode of ['light', 'dark']) {
  const c = theme[mode];
  for (const [platform, size, spec] of [['linkedin', 400, 'linkedinCompany'], ['x', 400, 'x'], ['instagram', 1080, null], ['github', 512, null], ['youtube', 800, null], ['discord', 512, null], ['whatsapp-business', 512, null]]) {
    await asset(`social/${platform}/profile-${mode}-${size}`, size, size, background(size, size, c.background) + mark(size * .1, size * .1, size * .8, c.ink), { kind: 'social-profile', platform, mode, spec, status: spec ? 'official-recommended-dimensions' : 'practical-high-resolution-export' });
  }
  for (const [name, w, h, spec, personal] of [['linkedin/company-cover', 1512, 256, 'linkedinCompany', false], ['linkedin/personal-banner', 1584, 396, 'linkedinPersonal', true], ['x/header', 1500, 500, 'x', true]]) {
    await asset(`social/${name}-${mode}-${w}x${h}`, w, h, cover(w, h, mode, personal), { kind: 'social-banner', platform: name.split('/')[0], mode, spec, status: 'official-recommended-dimensions' });
  }
  await asset(`social/linkedin/company-cover-master-${mode}-3024x512`, 3024, 512, cover(3024, 512, mode), { kind: 'social-banner', platform: 'linkedin', mode, spec: 'linkedinCompany', status: '2x-same-ratio-master' });
  for (const [name, w, h, spec] of [['linkedin/link-preview', 1200, 627, 'linkedinCompany'], ['instagram/post-square', 1080, 1080, null], ['instagram/post-portrait', 1080, 1350, null], ['instagram/story', 1080, 1920, null], ['whatsapp-business/status', 1080, 1920, null], ['github/repository-social-preview', 1280, 640, 'github']]) {
    await asset(`social/${name}-${mode}-${w}x${h}`, w, h, editorial(w, h, mode), { kind: 'social-graphic', platform: name.split('/')[0], mode, spec, status: spec ? 'official-recommended-dimensions' : 'practical-export-check-live-crop' });
  }
  await asset(`social/youtube/channel-banner-${mode}-2560x1440`, 2560, 1440, background(2560, 1440, c.background) + lockup(730, 570, 1100, c.ink) + lettering('tagline', 1280, 804, 27, c.muted, true) + lettering('website', 1280, 854, 25, c.muted, true), { kind: 'social-banner', platform: 'youtube', mode, spec: 'youtube', status: 'official-recommended-dimensions', safeArea: { x: 662.5, y: 551, width: 1235, height: 338, note: 'Deliberately uses the minimum-upload safe area without upscaling; conservative on a 2560×1440 canvas.' } });
  await asset(`social/youtube/watermark-${mode}-150`, 150, 150, mark(0, 0, 150, c.ink), { kind: 'watermark', platform: 'youtube', mode, transparent: true, spec: 'youtube', status: 'official-minimum-dimensions' });
  const orbitalLines = [-18, 0, 18].map(angle => `<rect x="333" y="108" width="294" height="294" rx="110" fill="none" stroke="${c.muted}" stroke-width="2" transform="rotate(${angle} 480 255)"/>`).join('');
  await asset(`social/discord/server-banner-${mode}-960x540`, 960, 540, background(960, 540, c.background) + orbitalLines, { label: 'Armature AI Labs orbital line motif', kind: 'social-banner', platform: 'discord', mode, spec: 'discord', status: 'official-recommended-dimensions', note: 'No text or logo, and top 48 px clear, per Discord guidance. Server entitlement not verified.' });
}

await emit('source/approved-circular-mark.svg', rawMark);
await mkdir(path.join(pack, 'fonts'), { recursive: true });
for (const name of ['SpaceMono-Regular.ttf', 'SpaceMono-Bold.ttf', 'OFL-SpaceMono.txt']) {
  const source = path.join(fontDirectory, name), destination = path.join(pack, 'fonts', name);
  if (source !== destination) await copyFile(source, destination);
}
await copyFile(path.join(root, 'brand/armature-lab/USAGE-AND-PERMISSIONS.md'), path.join(pack, 'USAGE-AND-PERMISSIONS.md'));
const manifest = { version: 'editorial-2026-09', date: '2026-09-13', status: 'approved-release', name: copy.name, palettes: theme, fonts: { wordmark: outlines.wordmark.resolvedFont, supporting: outlines.tagline.resolvedFont, distribution: 'Primary SVGs contain outlined lettering. Editable SVGs require a locally licensed Helvetica Neue. Helvetica font files are not included. Space Mono and its OFL are included.' }, sourceMark: { file: 'source/approved-circular-mark.svg', sha256: sourceHash, invariant: 'All path d, circle and stroke-width geometry is unchanged; only uniform scale, translation and colour vary. Mark is never rotated.' }, copy, sourcesChecked: '2026-09-13', sources, files: records };
await emit('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const rows = records.filter(item => item.mode === 'light' && item.platform).map(item => `| ${item.platform} | ${item.name.split('/').at(-1).replace('-light', '')} | ${item.width} × ${item.height} | ${item.status} |`).join('\n');
await emit('README.md', `# Armature AI Labs — editorial identity\n\nApproved release assets, 13 September 2026. Social-profile uploads remain separate. Earlier identity packs are preserved.\n\n## Identity\n\nUse **Armature AI Labs**, with capital A, uppercase AI and capital L. Retain the supplied circular commutator; do not rotate, stretch, redraw or add effects. Use the light assets on white/light surfaces and dark assets on near-black surfaces. Transparent light files contain dark ink; transparent dark files contain white ink.\n\nThe primary palette is white (#ffffff) and near-black (#111110), with #6b6862 or #bcbcb7 for secondary text. Wordmark/headings use Helvetica Neue Bold; supporting typography is Space Mono. Normal SVG exports have outlined lettering so they do not depend on installed fonts. Editable wordmarks are under editable/ and require a locally licensed Helvetica Neue; no Helvetica font files are redistributed. Space Mono is included with its OFL.\n\nKeep clear space of at least one central-shaft diameter around the mark and half the wordmark capital height around a lockup. Use the symbol alone for small/circular profile crops; use the horizontal lockup for headers. Practical screen guidance: mark at least 24 px, full lockup at least 190 px wide. These are design recommendations, not platform requirements.\n\n## Ready-to-copy descriptions\n\nOne line:\n\n${copy.oneLine}\n\nOne paragraph:\n\n${copy.paragraph}\n\nPublic contact: ${copy.email} · https://${copy.website}\n\nDescription provenance: src/pages/BrandingPage.tsx and src/pages/HomePage.tsx at the rollout baseline. The paragraph retains the existing lab description, adds the confirmed two-floor scope and omits the existing hourly-booking claim so brand boilerplate does not promise booking availability.\n\n## Files\n\n- logos/: symbols, square icons, horizontal/stacked lockups and wordmarks. Each design has PNG and SVG versions; PNG sizes include 512 px.\n- logos/square-named-{light,dark}-1024: 1024 × 1024 PNG/SVG named square lockups. Icon-only squares use logos/icon-{light,dark}-1024.\n- social/: seven platform folders with light and dark variants.\n- editable/: font-dependent SVG wordmarks for controlled editing.\n- source/: byte-preserved approved circular mark.\n- manifest.json: pixel dimensions, PNG byte sizes, SHA-256 hashes, source links and per-asset verification status.\n- contact-sheet.png: review overview, not an upload asset.\n\n## Platform matrix\n\n| Platform | Asset | Pixels | Status |\n| --- | --- | --- | --- |\n${rows}\n\nUse the ordinary LinkedIn company cover (1512 × 256); its 3024 × 512 companion is a 2× master. The freshly opened LinkedIn help page supersedes the stale 4200 × 700 search snippet. The personal LinkedIn banner is different; do not use the company logo as a person's profile portrait.\n\nYouTube keeps essential artwork inside a conservative centred 1235 × 338 rectangle on the 2560 × 1440 canvas. Discord's server banner deliberately has no name or mark: its official guide recommends no logo/text and a clear top 48 px. A server banner requires an eligible boosted/partner server; entitlement was not checked.\n\nInstagram, WhatsApp Business, and profile sizes without a cited requirement are practical high-resolution deliverables, not claimed official current specifications. Confirm the in-app crop before uploading. Some social surfaces recompress or crop images; no files were tested by uploading them. No new handles or account URLs are invented.\n\n## Sources\n\n${Object.values(sources).map(item => `- [${item.url.split('/')[2]}](${item.url}) — ${item.dimensions}`).join('\n')}\n\n## Rebuild\n\nFrom the isolated rollout root, run Node.js 22: node scripts/generate-editorial-brand.mjs. Requires macOS Swift/CoreText, locally installed Helvetica Neue, the included source/ mark and fonts, and installed sharp (first-time bootstrap can use the approved sibling preview). The primary SVGs and PNGs are portable; this font-outline generator is macOS-native.\n\n## Search Summary\n\n- Commands: webcmd --version; webcmd list --tag search; webcmd plugin search; webcmd web fetch; read-only web search/open for the official help pages above.\n- Browser fallback: none.\n- Gaps/failures: Webcmd plugin catalog fetch failed and local fetch returned listen EPERM. No retries or account access; available web tool supplied primary help-page content. Instagram/WhatsApp dimensions are practical exports.\n`);

const selections = [
  ['Light identity', 'logos/lockup-light-solid-1140.png'], ['Dark identity', 'logos/lockup-dark-solid-1140.png'],
  ['LinkedIn company cover', 'social/linkedin/company-cover-light-1512x256.png'], ['LinkedIn company cover · dark', 'social/linkedin/company-cover-dark-1512x256.png'],
  ['X / Twitter header', 'social/x/header-light-1500x500.png'], ['GitHub repository preview', 'social/github/repository-social-preview-dark-1280x640.png'],
  ['Instagram portrait', 'social/instagram/post-portrait-light-1080x1350.png'], ['Instagram story', 'social/instagram/story-dark-1080x1920.png'],
  ['YouTube channel banner', 'social/youtube/channel-banner-light-2560x1440.png'], ['Discord server banner', 'social/discord/server-banner-dark-960x540.png']
];
const tileWidth = 760, tileHeight = 390;
const composites = [];
for (let i = 0; i < selections.length; i++) {
  const [label, relative] = selections[i];
  const image = await sharp(path.join(pack, relative)).resize({ width: 710, height: 320, fit: 'contain', background: '#eeeeea' }).png().toBuffer();
  const heading = await sharp(Buffer.from(svg(tileWidth, 40, `<text x="25" y="28" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#111110">${esc(label)}</text>`))).png().toBuffer();
  composites.push({ input: heading, left: i % 2 * tileWidth, top: Math.floor(i / 2) * tileHeight }, { input: image, left: i % 2 * tileWidth + 25, top: Math.floor(i / 2) * tileHeight + 50 });
}
await sharp({ create: { width: tileWidth * 2, height: tileHeight * selections.length / 2, channels: 4, background: '#eeeeea' } }).composite(composites).png().toFile(path.join(pack, 'contact-sheet.png'));
await emit('validation.json', JSON.stringify({ sourceMarkSha256: sourceHash, glyphFonts: Object.fromEntries(Object.entries(outlines).map(([key, value]) => [key, value.resolvedFont])), assetCount: records.length, dimensions: 'All PNG dimensions matched requested sizes via sharp metadata.', maxPngBytes: Math.max(...records.map(item => item.bytes)), allSocialImagesUnder1MB: records.filter(item => item.platform).every(item => item.bytes < 1_000_000), geometry: 'Source mark SHA-256 pin checked before generation; path data unchanged in generated mark transforms.', visualReview: process.argv.includes('--reviewed') ? 'Contact sheet and representative full-size LinkedIn cover, 512 px dark icon, GitHub preview, Instagram portrait and YouTube safe-area crop inspected on 13 September 2026. No clipped text, incorrect casing or distorted marks observed.' : 'Pending native-size review of representative exports.', uploadStatus: 'Not uploaded.' }, null, 2) + '\n');
async function mirror(directory, target) {
  await mkdir(target, { recursive: true });
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, item.name), destination = path.join(target, item.name);
    if (item.isDirectory()) await mirror(source, destination);
    else if (!item.name.endsWith('.zip')) await copyFile(source, destination);
  }
}
await mirror(pack, publicPack);
for (const [name, paths] of [['armature-ai-labs-editorial-complete.zip', ['logos', 'social', 'editable', 'fonts', 'source', 'README.md', 'USAGE-AND-PERMISSIONS.md', 'manifest.json', 'validation.json', 'contact-sheet.png']], ['armature-ai-labs-editorial-logos.zip', ['logos', 'editable', 'README.md', 'USAGE-AND-PERMISSIONS.md', 'manifest.json']], ['armature-ai-labs-editorial-social.zip', ['social', 'README.md', 'USAGE-AND-PERMISSIONS.md', 'manifest.json']]]) {
  execFileSync('/usr/bin/zip', ['-q', '-r', path.join(pack, name), ...paths], { cwd: pack });
  await copyFile(path.join(pack, name), path.join(publicPack, name));
}
console.log(JSON.stringify({ pack, publicPack, assets: records.length, largestPng: Math.max(...records.map(item => item.bytes)), completeZipBytes: (await stat(path.join(pack, 'armature-ai-labs-editorial-complete.zip'))).size }, null, 2));
