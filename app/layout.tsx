import type { Metadata, Viewport } from "next";
import "./globals.css";

// Without this, mobile browsers render into a ~980px virtual viewport and
// scale the result down, which is why every control looked simultaneously
// tiny and off-screen. Nothing here changes desktop rendering.
//
// `userScalable` is deliberately left alone: pinch-zoom is an accessibility
// affordance, and disabling it is a common way to make a dense surface
// unusable for anyone who needs to magnify it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

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
