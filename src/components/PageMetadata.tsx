import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    let current = true;
    void import("../lib/seo").then(({ getPageSeo, renderSeoHead }) => {
      if (!current) return;
      document.head.querySelectorAll(
        '[data-seo], title, meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"]'
      ).forEach((element) => element.remove());
      document.head.insertAdjacentHTML("beforeend", renderSeoHead(getPageSeo(pathname)));
    });
    return () => { current = false; };
  }, [pathname]);
  return null;
}
