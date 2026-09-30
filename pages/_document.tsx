import { Html, Head, Main, NextScript } from "next/document";

export default function PrintDocument() {
  return (
    <Html lang="en" className="h-full antialiased">
      <Head />
      <body className="min-h-full bg-[var(--i-void)] text-[var(--i-text)]">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
