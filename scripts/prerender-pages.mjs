import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const outputDirectory = path.join(root, "dist");
const cacheDirectory = path.join(root, "node_modules/.tmp");
await mkdir(cacheDirectory, { recursive: true });
const serverDirectory = await mkdtemp(path.join(cacheDirectory, "prerender-"));

try {
  await build({
    configFile: false,
    root,
    mode: process.argv[2] ?? "production",
    plugins: [react()],
    logLevel: "warn",
    build: {
      ssr: "src/entry-server.tsx",
      outDir: serverDirectory,
      copyPublicDir: false,
      rollupOptions: { output: { entryFileNames: "entry-server.mjs" } }
    }
  });
  const { renderPage, publicSeoPaths, getPageSeo, renderSeoHead, SITE_URL } = await import(
    pathToFileURL(path.join(serverDirectory, "entry-server.mjs")).href
  );
  const template = (await readFile(path.join(outputDirectory, "index.html"), "utf8"))
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, "");
  const manifest = JSON.parse(await readFile(path.join(outputDirectory, ".vite/manifest.json"), "utf8"));
  const stylesFor = (modules) => {
    const styles = new Set();
    const visited = new Set();
    const visit = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      const entry = manifest[id];
      if (!entry) throw new Error(`Client module missing from build manifest: ${id}`);
      for (const css of entry.css ?? []) styles.add(css);
      for (const dependency of entry.imports ?? []) visit(dependency);
    };
    modules.forEach(visit);
    return [...styles].filter((css) => !template.includes(`href="/${css}"`))
      .map((css) => `<link rel="stylesheet" crossorigin href="/${css}">`).join("");
  };
  const documentFor = (pathname, body = "", modules = []) => template
    .replace("</head>", `${renderSeoHead(getPageSeo(pathname))}${stylesFor(modules)}</head>`)
    .replace('<div id="root"></div>', body
      ? `<div id="root" data-prerendered-path="${pathname.replace(/\/+$/, "") || "/"}">${body}</div>`
      : '<div id="root"></div>');

  await writeFile(path.join(outputDirectory, "app-shell.html"), documentFor("/auth/"));
  await writeFile(path.join(outputDirectory, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicSeoPaths.map((pathname) => `  <url><loc>${SITE_URL}${pathname}</loc></url>`).join("\n")}\n</urlset>\n`);
  const paths = [...new Set([...publicSeoPaths, "/members/"])];
  for (const pathname of paths) {
    const { html, modules } = await renderPage(pathname);
    if (!html.includes("<h1")) throw new Error(`Prerendered page is missing its heading: ${pathname}`);
    const directory = path.join(outputDirectory, pathname);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "index.html"), documentFor(pathname, html, modules));
  }
  const notFound = await renderPage("/not-found/");
  await writeFile(path.join(outputDirectory, "404.html"), documentFor("/not-found/", notFound.html));
  console.log(`Prerendered ${paths.length} anonymous public pages plus a real 404 document.`);
} finally {
  await rm(serverDirectory, { recursive: true, force: true });
}
