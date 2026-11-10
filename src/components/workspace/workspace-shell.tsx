"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  Globe,
  Home,
  Link2,
  Menu,
  PenLine,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Active navigation lists only destinations that exist. Out-of-scope areas
 * (Experience, Education, Skills, Portfolio, Projects, Highlights, Timeline,
 * Articles, Digital Cards, CV Studio, AI Assistant, Connected Accounts,
 * Privacy & Sharing, Account Settings) stay out until their screens ship, so
 * nothing in the sidebar is a dead or misleading link.
 */
const groups = [
  {
    title: "MY IDENTITY",
    links: [
      { label: "Overview", href: "/", icon: Home },
      { label: "Profile", href: "/profile", icon: UserRound },
      { label: "Articles & Thoughts", href: "/articles", icon: PenLine },
    ],
  },
  {
    title: "MY PRESENCE",
    links: [
      { label: "My Website", href: "/website", icon: Globe },
      { label: "Personas", href: "/personas", icon: UsersRound },
      {
        label: "Social & Web Profiles",
        href: "/profile?section=social",
        icon: Link2,
      },
    ],
  },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function currentSection(pathname: string) {
  for (const group of groups) {
    for (const link of group.links) {
      if (isActive(pathname, link.href)) return link.label;
    }
  }
  return "Overview";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? parts[parts.length - 1]![0]! : "")
    ).toUpperCase() || "?"
  );
}

export function WorkspaceShell({
  children,
  viewer = { name: "Alex Morgan" },
}: {
  children: ReactNode;
  /** Signed-in person shown in the sidebar and header. Defaults to the sample persona. */
  viewer?: { name: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="min-h-screen md:flex">
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
          <span className="font-serif text-2xl tracking-tight">
            folioone<span className="text-[#c88c68]">.</span>
          </span>
          <button
            className="md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav
          aria-label="Workspace navigation"
          className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
        >
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="px-3 pb-2 text-[10px] font-semibold tracking-[.16em] text-white/45">
                {group.title}
              </h2>
              <ul className="space-y-1">
                {group.links.map(({ label, href, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={label}>
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded px-3 py-2 text-[13px] ${active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                      >
                        <Icon className="size-4" strokeWidth={1.7} />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-[#d9b9a3] text-[#302b27]">
                {initials(viewer.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{viewer.name}</p>
              <p className="text-xs text-white/50">Personal workspace</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-border bg-background/95 sticky top-0 z-20 flex h-16 items-center justify-between border-b px-5 backdrop-blur-sm md:px-9">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <span className="text-muted-foreground text-sm">
              My workspace <span className="mx-2">/</span>
              <span className="text-foreground">
                {currentSection(pathname)}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-[#d9b9a3] text-[#302b27]">
                      {initials(viewer.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm sm:inline">
                    {viewer.name}
                  </span>
                  <ChevronDown className="text-muted-foreground size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/website">My Website</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/personas">Personas</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <LogoutButton />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 md:px-9 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
