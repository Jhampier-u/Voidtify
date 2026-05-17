import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ledger — Tu biblioteca de Spotify",
  description: "Organizador editorial para tu biblioteca de Spotify.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-cream font-serif selection:bg-acid selection:text-ink">
        {children}
      </body>
    </html>
  );
}
