"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  CircleUserRound,
  FileText,
  FolderKanban,
  GraduationCap,
  Home,
  Lightbulb,
  Menu,
  Network,
  Settings,
  Share2,
  Sparkles,
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

const groups = [
  {
    title: "MY IDENTITY",
    links: [
      ["Overview", Home],
      ["Profile", UserRound],
      ["Experience", BriefcaseBusiness],
      ["Education", GraduationCap],
      ["Skills & Expertise", Sparkles],
    ],
  },
  {
    title: "MY PORTFOLIO",
    links: [
      ["Portfolio", Share2],
      ["Projects", FolderKanban],
      ["Highlights", Activity],
      ["Timeline", Activity],
      ["Articles & Thoughts", BookOpen],
    ],
  },
  {
    title: "MY PERSONAS",
    links: [
      ["Personas", UsersRound],
      ["Digital Cards", CircleUserRound],
    ],
  },
  {
    title: "MY TOOLS",
    links: [
      ["CV Studio", FileText],
      ["AI Assistant", Lightbulb],
      ["Connected Accounts", Network],
    ],
  },
  {
    title: "SETTINGS",
    links: [
      ["Privacy & Sharing", Share2],
      ["Account Settings", Settings],
    ],
  },
] as const;

export function WorkspaceShell({ children }: { children: ReactNode }) {
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
                {group.links.map(([label, Icon], index) => (
                  <li key={label}>
                    <a
                      href={label === "Profile" ? "/profile" : "#"}
                      onClick={(event) => {
                        if (label !== "Profile") event.preventDefault();
                        setOpen(false);
                      }}
                      aria-current={
                        (pathname === "/" &&
                          group.title === "MY IDENTITY" &&
                          index === 0) ||
                        (pathname === "/profile" && label === "Profile")
                          ? "page"
                          : undefined
                      }
                      className={`flex items-center gap-3 rounded px-3 py-2 text-[13px] ${(pathname === "/" && group.title === "MY IDENTITY" && index === 0) || (pathname === "/profile" && label === "Profile") ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
                    >
                      <Icon className="size-4" strokeWidth={1.7} />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-[#d9b9a3] text-[#302b27]">
                AM
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">Alex Morgan</p>
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
              <span className="text-foreground">Overview</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-[#d9b9a3] text-[#302b27]">
                      AM
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm sm:inline">Alex Morgan</span>
                  <ChevronDown className="text-muted-foreground size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Profile settings</DropdownMenuItem>
                <DropdownMenuItem>Privacy & sharing</DropdownMenuItem>
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
