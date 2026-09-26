import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router-dom";
import { PassThrough } from "node:stream";
import { Providers } from "./app/Providers";
import { routes } from "./app/routes";

export { getPageSeo, publicSeoPaths, renderSeoHead, SITE_URL } from "./lib/seo";

const handler = createStaticHandler(routes);

export async function renderPage(pathname: string): Promise<{ html: string; modules: string[] }> {
  const context = await handler.query(new Request(`https://armatureailabs.com${pathname}`));
  if (context instanceof Response) throw new Error(`Unexpected prerender response for ${pathname}: ${context.status}`);
  const router = createStaticRouter(handler.dataRoutes, context);

  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    let html = "";
    output.on("data", (chunk) => { html += chunk.toString(); });
    output.on("end", () => resolve({
      html,
      modules: context.matches.flatMap(({ route }) => route.handle?.module ? [route.handle.module as string] : [])
    }));
    output.on("error", reject);
    const stream = renderToPipeableStream(
      <StrictMode>
        <Providers hydrate>
          <Suspense fallback={<div className="route-loading mono">Loading floor plan…</div>}>
            <StaticRouterProvider router={router} context={context} hydrate={false} />
          </Suspense>
        </Providers>
      </StrictMode>,
      {
        onAllReady() { stream.pipe(output); },
        onShellError: reject,
        onError(error) {
          stream.abort();
          reject(error);
        }
      }
    );
  });
}
