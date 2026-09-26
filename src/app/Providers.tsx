import type { PropsWithChildren } from "react";
import { AppProvider } from "../context/AppContext";
import { InventoryProvider } from "../context/InventoryContext";
import { ThemeProvider } from "../context/ThemeContext";

export function Providers({ children, hydrate = false }: PropsWithChildren<{ hydrate?: boolean }>) {
  return (
    <ThemeProvider hydrate={hydrate}>
      <AppProvider hydrate={hydrate}>
        <InventoryProvider hydrate={hydrate}>{children}</InventoryProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
