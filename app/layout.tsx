import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import "./v2.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Altair Lite · Run a tourism business from your own Claude",
  description: "An open demo of Altair by Starknot: a sandbox tourism business you run from your own Claude, with a live panel. Sample data, no sign-up.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200"),
  openGraph: { title: "Altair Lite", description: "Run a tourism business from your own Claude. An open demo with sample data.", type: "website" },
};
export const viewport: Viewport = { themeColor: "#fbfaf8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
