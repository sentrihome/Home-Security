/**
 * Theme provider — wraps app with next-themes for dark/light mode toggle.
 */

"use client";

import dynamic from "next/dynamic";

const NextThemesProvider = dynamic(
  () => import("next-themes").then((e) => ({ default: e.ThemeProvider })),
  { ssr: false },
);

interface ThemeProviderProps {
  children: React.ReactNode;
  [key: string]: any;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
