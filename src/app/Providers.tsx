import type { PropsWithChildren } from "react";
import { AccountProvider } from "../context/AccountContext";
import { AppProvider } from "../context/AppContext";
import { InventoryProvider } from "../context/InventoryContext";
import { ThemeProvider } from "../context/ThemeContext";

export function Providers({ children, hydrate = false }: PropsWithChildren<{ hydrate?: boolean }>) {
  return (
    <ThemeProvider hydrate={hydrate}>
      <AppProvider hydrate={hydrate}>
        <AccountProvider><InventoryProvider hydrate={hydrate}>{children}</InventoryProvider></AccountProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
