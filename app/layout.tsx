import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Poppins } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  display: "swap",
});

const display = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Prime Project Tracker", template: "%s · Prime Project Tracker" },
  description: "Track student hackathons, internships, events and verified results.",
};

export const viewport: Viewport = {
  themeColor: "#2e3192",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
