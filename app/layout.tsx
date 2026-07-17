import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "KIT Gap Audit",
  description: "Turn messy context into clarity: missing work, decisions, owners, and what they block.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex bg-[var(--color-paper)] text-[var(--color-ink)]">
        <Nav />
        <main className="flex-1 min-h-screen">{children}</main>
      </body>
    </html>
  );
}
