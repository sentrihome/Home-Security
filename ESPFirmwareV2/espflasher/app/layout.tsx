import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "ESP Flasher",
  description: "Flash ESP32 / ESP8266 devices via Web Serial API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider>
          {/* Near-black background with surveillance grid */}
          <div className="relative min-h-screen bg-[oklch(0.075_0.005_260)]">
            <div className="absolute inset-0 bg-surveillance-grid opacity-60" />
            <div className="relative z-10">{children}</div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
