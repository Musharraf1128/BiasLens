import type { Metadata } from "next";
import "@fontsource-variable/archivo";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiasLens — multi-perspective news intelligence",
  description:
    "See what outlets agree on, how each frames the story, and what coverage is missing — with evidence and source links.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
