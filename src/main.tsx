import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppProvider } from "./context/AppContext";
import { InventoryProvider } from "./context/InventoryContext";
import { ThemeProvider } from "./context/ThemeContext";
import { installChunkRecovery, removeLegacyPwaCaches } from "./lib/pwaMigration";
import "./styles.css";
import "./editorial.css";

installChunkRecovery();
void removeLegacyPwaCaches();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppProvider>
        <InventoryProvider>
          <App />
        </InventoryProvider>
      </AppProvider>
    </ThemeProvider>
  </StrictMode>
);
