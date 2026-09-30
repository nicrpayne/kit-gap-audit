import type { AppProps } from "next/app";
import "../app/globals.css";

// The isolated, buffered report-print route uses the same design/print rules
// as the instrument screens. All interactive instruments remain App Router.
export default function PrintApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
