import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./app/App";
import { Providers } from "./app/Providers";
import { installChunkRecovery, removeLegacyPwaCaches } from "./lib/pwaMigration";
import "./styles.css";
import "./editorial.css";

installChunkRecovery();
void removeLegacyPwaCaches();

const root = document.getElementById("root")!;
const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
const hydrate = root.dataset.prerenderedPath === pathname && !window.location.search;
const app = (
  <StrictMode>
    <Providers hydrate={hydrate}><App /></Providers>
  </StrictMode>
);

if (hydrate) hydrateRoot(root, app);
else createRoot(root).render(app);
