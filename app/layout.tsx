import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "From Working Demo to Production Architecture — Aurelian OS",
  description: "How a structured research pipeline changed every assumption. 19 ADRs, 17 disqualifications, and the architecture that emerged from evidence rather than familiarity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
