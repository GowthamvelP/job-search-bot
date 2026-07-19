"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Settings, Bookmark, BarChart3, Sparkles, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { href: "/discover", label: "Discover", icon: Compass, enabled: true },
  { href: "/saved", label: "Saved", icon: Bookmark, enabled: false },
  { href: "/analytics", label: "Analytics", icon: BarChart3, enabled: false },
  { href: "/onboarding", label: "Profile", icon: Settings, enabled: true },
];

interface SidebarProps {
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-16 border-r border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col items-center gap-1 py-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon, enabled }) => {
          const active = pathname === href || pathname.startsWith(href + "/");

          if (!enabled) {
            return (
              <div
                key={href}
                className="group relative flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground/40 cursor-not-allowed"
                title={`${label} — Coming soon`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs font-medium opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg border border-border/50">
                  {label} <span className="text-muted-foreground text-[10px]">· soon</span>
                </span>
              </div>
            );
          }

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
              <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs font-medium opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg border border-border/50">
                {label}
              </span>
              {active && (
                <span className="absolute -left-[1px] top-2 bottom-2 w-[2px] rounded-full bg-foreground" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User avatar + sign out */}
      <div className="flex flex-col items-center gap-1 py-3 border-t border-border/50">
        {user && (
          <div className="group relative mb-1">
            {user.image ? (
              <img src={user.image} alt="" className="w-8 h-8 rounded-full ring-1 ring-border/50" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                {user.name?.[0] || user.email?.[0] || "?"}
              </div>
            )}
            <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs font-medium opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg border border-border/50 z-50">
              {user.name || user.email}
            </span>
          </div>
        )}
        <a
          href="/signout"
          className="group relative flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs font-medium opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg border border-border/50 z-50">
            Sign out
          </span>
        </a>
      </div>
    </aside>
  );
}
