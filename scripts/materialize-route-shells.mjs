import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const legacyDirectoryRoutes = ["building-vision", "projects"];
const source = path.resolve("dist/index.html");
const articleUrl = "https://armatureailabs.com/blog/model-hardware-standard/";
const coverUrl = "https://armatureailabs.com/blog-covers/mhs-common-interface.png";
const articleTitle = "MHS could be physical AI’s MCP moment.";
const articleDescription = "A shared interface could change how builders connect models to machines. The hard part is making those connections dependable.";

await Promise.all(
  legacyDirectoryRoutes.map(async (route) => {
    const directory = path.resolve("dist", route);
    await mkdir(directory, { recursive: true });
    await copyFile(source, path.join(directory, "index.html"));
  })
);

const articleDirectory = path.resolve("dist/blog/model-hardware-standard");
const articleHead = `
    <link rel="canonical" href="${articleUrl}" />
    <meta name="robots" content="max-image-preview:large" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Armature AI Labs" />
    <meta property="og:title" content="${articleTitle}" />
    <meta property="og:description" content="${articleDescription}" />
    <meta property="og:url" content="${articleUrl}" />
    <meta property="og:image" content="${coverUrl}" />
    <meta property="og:image:alt" content="Abstract instruments aligned around a shared connector" />
    <meta property="og:image:width" content="1672" />
    <meta property="og:image:height" content="941" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${coverUrl}" />
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: articleTitle,
      description: articleDescription,
      image: { "@type": "ImageObject", url: coverUrl, width: 1672, height: 941 },
      datePublished: "2026-09-13",
      author: { "@type": "Organization", name: "Armature AI Labs" },
      publisher: { "@type": "Organization", name: "Armature AI Labs" },
      mainEntityOfPage: articleUrl
    })}</script>`;
const articleShell = (await readFile(source, "utf8"))
  .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${articleDescription}" />`)
  .replace(/<title>[^<]*<\/title>/, `<title>${articleTitle} · Armature AI Labs</title>`)
  .replace("</head>", `${articleHead}\n  </head>`);
await mkdir(articleDirectory, { recursive: true });
await writeFile(path.join(articleDirectory, "index.html"), articleShell);

async function listAssetFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? listAssetFiles(path.join(directory, entry.name), relativePath)
      : [relativePath];
  }));
  return files.flat();
}

const assetFiles = await listAssetFiles(path.resolve("dist/assets"));
const functionRoutes = {
  version: 1,
  include: ["/assets/*"],
  exclude: assetFiles.map((asset) => `/assets/${asset}`).sort()
};
const allRoutes = [...functionRoutes.include, ...functionRoutes.exclude];

if (allRoutes.length > 100) {
  throw new Error("Cloudflare _routes.json supports at most 100 include/exclude rules.");
}

const oversizedRoute = allRoutes.find((route) => route.length > 100);
if (oversizedRoute) {
  throw new Error(`Cloudflare _routes.json routes may not exceed 100 characters: ${oversizedRoute}`);
}

await writeFile(
  path.resolve("dist/_routes.json"),
  `${JSON.stringify(functionRoutes, null, 2)}\n`
);
