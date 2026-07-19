"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Settings, Bookmark, BarChart3, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/onboarding", label: "Profile", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-16 border-r border-border/50 bg-card/50 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col items-center gap-1 py-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 ${
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
              title={label}
            >
              <Icon className="w-[18px] h-[18px]" />
              {/* Tooltip */}
              <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs font-medium opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg border border-border/50">
                {label}
              </span>
              {/* Active indicator */}
              {active && (
                <span className="absolute -left-[1px] top-2 bottom-2 w-[2px] rounded-full bg-foreground" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
