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
import { BrandMark } from "@/components/brand-mark";
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
    <div className="bg-sidebar min-h-screen md:flex">
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      {/* The sidebar shares the chrome colour; the active link is a curved tab
          that joins the canvas panel to its right (see .nav-tab in globals.css). */}
      <aside
        className={`bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform md:sticky md:top-0 md:h-screen md:w-60 md:translate-x-0 lg:w-64 ${open ? "translate-x-0 shadow-2xl md:shadow-none" : "-translate-x-full"}`}
      >
        <div className="flex h-[4.5rem] items-center justify-between gap-2 pr-4 pl-6">
          <Link
            href="/"
            className="rounded-full"
            onClick={() => setOpen(false)}
          >
            <BrandMark />
          </Link>
          <span className="border-success/30 bg-success-soft text-success hidden rounded-full border px-2 py-0.5 text-[9.5px] font-semibold tracking-[.14em] uppercase md:inline">
            Private
          </span>
          <button
            className="hover:bg-card/70 rounded-full p-1.5 md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav
          aria-label="Workspace navigation"
          className="flex-1 space-y-7 overflow-y-auto py-5 pr-3 pl-3 md:pr-0"
        >
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="text-sidebar-muted px-4 pb-2 text-[10.5px] font-medium tracking-[.14em]">
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
                        className={`nav-tab flex h-11 items-center gap-3 rounded-xl px-4 text-[13.5px] transition-colors md:rounded-l-2xl ${active ? "font-medium" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/55 md:mr-3"}`}
                      >
                        <Icon
                          className={`size-[17px] ${active ? "" : "opacity-80"}`}
                          strokeWidth={1.7}
                        />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
        <div className="p-3">
          <div className="bg-card/70 flex items-center gap-3 rounded-2xl p-3">
            <Avatar className="size-9">
              <AvatarFallback className="bg-muted text-foreground text-xs font-medium">
                {initials(viewer.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{viewer.name}</p>
              <p className="text-sidebar-muted text-xs">Personal workspace</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 md:sticky md:top-0 md:h-screen md:py-3 md:pr-3">
        <div className="bg-background flex min-h-screen flex-col md:h-full md:min-h-0 md:overflow-y-auto md:rounded-[28px]">
          <header className="border-border bg-card/85 sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b px-5 backdrop-blur-md md:h-[4.5rem] md:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
                onClick={() => setOpen(true)}
              >
                <Menu className="size-5" />
              </Button>
              <span className="text-muted-foreground truncate text-sm">
                <span className="hidden sm:inline">
                  My workspace
                  <span className="text-border mx-2.5">/</span>
                </span>
                <span className="text-foreground font-medium">
                  {currentSection(pathname)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 pr-3 pl-1.5">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-foreground text-xs font-medium ring-1 ring-black/5">
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
          <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-10 md:py-12">
            {children}
          </main>
          <footer className="border-border text-muted-foreground flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-[13px] md:px-10">
            <p className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-success size-2 rounded-full"
              />
              Private by default — only you can see this workspace
            </p>
            <p className="flex gap-6">
              <Link href="/profile" className="hover:text-foreground">
                Master Identity
              </Link>
              <Link href="/website" className="hover:text-foreground">
                Publishing
              </Link>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
