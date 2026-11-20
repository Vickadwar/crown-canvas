/**
 * @file src/app/layout.tsx
 * @description Root Next.js App Router layout wiring local Satoshi typography,
 * 6 curated self-hosted Studio Google Fonts (offline-safe for Mini PC & Android TV),
 * global Tailwind styles, Sonner toast notifications, and hydration safety.
 */

import type { Metadata } from "next";
import localFont from "next/font/local";
import {
  Bebas_Neue,
  JetBrains_Mono,
  Montserrat,
  Oswald,
  Playfair_Display,
  Space_Grotesk,
} from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const satoshi = localFont({
  src: [
    {
      path: "../../public/fonts/satoshi/Satoshi-Light.woff",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/satoshi/Satoshi-Regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/satoshi/Satoshi-Italic.woff",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/satoshi/Satoshi-Medium.woff",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/satoshi/Satoshi-Bold.woff",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/satoshi/Satoshi-Black.woff",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crown Canvas — Crown Paints Digital Signage",
  description:
    "Enterprise digital signage CMS & offline-first showroom player for Kenya, Tanzania, and Uganda.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${satoshi.variable} ${playfair.variable} ${oswald.variable} ${montserrat.variable} ${spaceGrotesk.variable} ${bebasNeue.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col font-sans"
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
