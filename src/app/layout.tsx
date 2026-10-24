import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, IBM_Plex_Mono, Work_Sans } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

// Same fonts as DayPilot: Fraunces (display, large optical size), Work Sans (text), IBM Plex Mono (clock).
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["opsz"] });
const sans = Work_Sans({ variable: "--font-text", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Nirdesh — court orders, done on time",
  description:
    "Nirdesh turns court directions into owned, dated tasks with human sign-off, explains orders to citizens in their language, and answers questions about Acts and filings.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {/* Shell and pages read the URL and localStorage, so they render on the client. */}
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
