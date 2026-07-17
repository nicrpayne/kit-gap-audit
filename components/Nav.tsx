"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY_TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/audit/new", label: "Audit" },
  { href: "/decisions", label: "Decisions" },
];

const COMING_NEXT_TABS = [
  { href: "/forecast", label: "Forecast" },
  { href: "/timeline", label: "Timeline" },
  { href: "/reports", label: "Reports" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Nav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <aside className="w-64 shrink-0 bg-[var(--color-ink)] text-[var(--color-paper)] flex flex-col min-h-screen">
      <div className="px-6 py-7 flex items-center gap-3 border-b border-white/10">
        <div className="h-9 w-9 rounded-md bg-[var(--color-accent)] flex items-center justify-center font-display text-lg font-semibold text-white">
          K
        </div>
        <div>
          <div className="font-display text-lg leading-tight">KIT</div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-paper)]/50">
            Gap Audit
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-[var(--color-paper)]/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}

        <div className="mt-6 mb-2 px-3 text-[10px] uppercase tracking-wider text-[var(--color-paper)]/40">
          Coming next
        </div>
        {COMING_NEXT_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-[var(--color-paper)]/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-white/10">
        <Link
          href="/scopes"
          className={`block px-3 py-2 rounded-md text-xs transition-colors ${
            isActive(pathname, "/scopes")
              ? "bg-white/10 text-white font-medium"
              : "text-[var(--color-paper)]/50 hover:bg-white/5 hover:text-white/80"
          }`}
        >
          Scopes settings
        </Link>
      </div>
      <div className="px-6 py-5 border-t border-white/10 text-[11px] text-[var(--color-paper)]/40">
        Gap Audit v0
      </div>
    </aside>
  );
}
