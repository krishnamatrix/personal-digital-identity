import Link from "next/link";
import { ArrowUpRight, Eye, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const personas = [
  { name: "Product Leader", detail: "Professional", initials: "PL" },
  { name: "Studio Morgan", detail: "Creative", initials: "SM" },
];
const highlights = [
  { title: "Launched Atlas", detail: "Product · 2024", color: "bg-[#d8c4aa]" },
  {
    title: "Designing for scale",
    detail: "Milestone · 2023",
    color: "bg-[#b8c7bc]",
  },
  {
    title: "Community builder",
    detail: "Recognition · 2022",
    color: "bg-[#d7b8a8]",
  },
];

export function Dashboard() {
  return (
    <div className="space-y-9" data-testid="dashboard">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-accent mb-2 text-xs font-semibold tracking-[.16em] uppercase">
            Sunday, November 8
          </p>
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
            Good morning, Alex.
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            Your identity is taking shape. Here’s your workspace at a glance.
          </p>
        </div>
        <Button variant="outline">
          <Eye className="size-4" />
          Preview portfolio
        </Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="border-border bg-card rounded-lg border p-6 md:p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-[.14em] uppercase">
                Your identity
              </p>
              <h2 className="mt-2 font-serif text-2xl">Alex Morgan</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Product designer & thoughtful builder
              </p>
            </div>
            <Badge>Private</Badge>
          </div>
          <div className="mt-7 flex items-center gap-5">
            <div className="relative size-16 rounded-full bg-[#e6d5c4]">
              <span className="absolute inset-0 flex items-center justify-center font-serif text-xl text-[#655347]">
                AM
              </span>
            </div>
            <div className="flex-1">
              <div className="mb-2 flex justify-between text-xs">
                <span>Profile completion</span>
                <span className="font-medium">68%</span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div className="bg-accent h-full w-[68%] rounded-full" />
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                A few details will make your story shine.
              </p>
            </div>
          </div>
          <div className="border-border mt-6 border-t pt-4">
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="size-2 rounded-full bg-[#879782]" />
              Your profile is private and only visible to you
            </p>
          </div>
        </section>
        <section className="border-border overflow-hidden rounded-lg border bg-[#e8e2d8] p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[.14em] uppercase">
              Portfolio preview
            </p>
            <button aria-label="Open portfolio preview">
              <ArrowUpRight className="size-4" />
            </button>
          </div>
          <div className="mt-4 flex min-h-36 items-end rounded bg-[#c9b7a2] p-5">
            <div className="w-full border-b border-[#65594d]/35 pb-3">
              <p className="font-serif text-2xl text-[#302d28]">Alex Morgan</p>
              <p className="mt-1 text-xs text-[#51483f]">
                Designing what comes next.
              </p>
            </div>
          </div>
          <div className="text-muted-foreground mt-3 flex items-center justify-between text-xs">
            <span>Last edited just now</span>
            <span>Draft preview</span>
          </div>
        </section>
      </div>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl">Your personas</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Different sides of your story, thoughtfully curated.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/personas">Manage personas</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/personas/new">
                <Plus className="size-4" />
                New persona
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {personas.map((persona) => (
            <article
              key={persona.name}
              className="border-border bg-card flex items-center gap-4 rounded-lg border p-5"
            >
              <div className="bg-accent-soft text-accent flex size-11 items-center justify-center rounded-full font-serif text-sm">
                {persona.initials}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium">{persona.name}</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Example · {persona.detail} persona
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-2xl">A few highlights</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Moments and milestones worth remembering.
            </p>
          </div>
          <Button variant="ghost" size="sm">
            View all <ArrowUpRight className="size-4" />
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {highlights.map((item) => (
            <article
              key={item.title}
              className="border-border bg-card overflow-hidden rounded-lg border"
            >
              <div className={`h-28 ${item.color}`} />
              <div className="p-4">
                <h3 className="text-sm font-medium">{item.title}</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {item.detail}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <aside className="flex items-start gap-3 rounded-lg border border-[#e3d2c5] bg-[#f4ece5] p-5">
        <Sparkles className="text-accent mt-0.5 size-4" />
        <div>
          <p className="text-sm font-medium">A thoughtful next step</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Add a project you’re proud of to bring your portfolio to life.
          </p>
        </div>
      </aside>
    </div>
  );
}
