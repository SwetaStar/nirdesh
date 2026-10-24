import type { Metadata } from "next";
import { Suspense } from "react";
import { Poppins } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Nirdesh — court orders, done on time",
  description:
    "Nirdesh turns court directions into owned, dated tasks with human sign-off, explains orders to citizens in their language, and answers questions about Acts and filings.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {/* Shell and pages read the URL and localStorage, so they render on the client. */}
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
