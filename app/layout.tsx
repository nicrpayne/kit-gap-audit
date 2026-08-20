import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal",
  description:
    "One instrument for a project's truth: what is happening, what is missing, what is unresolved, and where it lands.",
};

// ONE SHELL. The root layout used to render the Workbench sidebar beside
// every page, and each instrument route then hid it and drew its own rail
// — two navigations, one of which was always standing down. Signal has a
// single shell now: each page mounts InstrumentShell (directly, or through
// SignalSurface for the reading surfaces), so the chrome belongs to the
// application rather than to the layout, and there is nothing left here to
// disagree with it.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--i-void)] text-[var(--i-text)]">{children}</body>
    </html>
  );
}
