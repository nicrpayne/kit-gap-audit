"use client";

import NextLink, { type LinkProps } from "next/link";
import { useSearchParams } from "next/navigation";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { contextualHref } from "@/lib/shell/context";

type Props = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    href: string;
  };

/** Next Link with Signal's project/selection handoff contract applied. */
const SignalLink = forwardRef<HTMLAnchorElement, Props>(function SignalLink({ href, ...props }, ref) {
  const params = useSearchParams();
  return <NextLink ref={ref} href={contextualHref(href, params)} {...props} />;
});

export default SignalLink;

