import Link from "next/link";
import { ArrowUpRight, Eye, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const personas = [
  {
    name: "Product Leader",
    detail: "Professional",
    initials: "PL",
    audience: "Hiring managers",
    sections: "6 sections",
  },
  {
    name: "Studio Morgan",
    detail: "Creative",
    initials: "SM",
    audience: "Clients & studios",
    sections: "4 sections",
  },
];
const stats = [
  {
    label: "Profile completion",
    value: "68%",
    delta: "+12% this week",
    note: "A few details will make your story shine",
  },
  {
    label: "Personas",
    value: "2",
    delta: "Examples",
    note: "Curated views of one Master Identity",
  },
  {
    label: "Highlights",
    value: "3",
    delta: "Since 2022",
    note: "Moments worth remembering",
  },
  {
    label: "Visibility",
    value: "Private",
    delta: "Default",
    note: "Nothing is published until you choose",
  },
];
const highlights = [
  {
    title: "Launched Atlas",
    detail: "Product · 2024",
    tone: "from-[#e9e9ee] to-[#d9dbe2]",
  },
  {
    title: "Designing for scale",
    detail: "Milestone · 2023",
    tone: "from-[#e6efe9] to-[#d3e3d9]",
  },
  {
    title: "Community builder",
    detail: "Recognition · 2022",
    tone: "from-[#efebe6] to-[#e2dcd4]",
  },
];

export function Dashboard() {
  return (
    <div className="space-y-10" data-testid="dashboard">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-3">Sunday, November 8</p>
          <h1 className="font-display text-4xl md:text-[2.75rem] md:leading-tight">
            Good morning, Alex.
          </h1>
          <p className="text-muted-foreground mt-2 text-[15px]">
            Your identity is taking shape. Here’s your workspace at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="px-3 py-1.5 text-[13px]">
            <span className="bg-success size-2 rounded-full" />
            Private by default
          </Badge>
          <Button variant="outline">
            <Eye className="size-4" />
            Preview portfolio
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <section
            key={stat.label}
            className="border-border bg-card rounded-lg border p-6"
          >
            <p className="eyebrow">{stat.label}</p>
            <p className="mt-4 flex items-baseline gap-2.5">
              <span className="font-display text-[2.25rem] leading-none">
                {stat.value}
              </span>
              <span className="text-success text-[13px] font-medium">
                {stat.delta}
              </span>
            </p>
            <p className="text-muted-foreground mt-4 text-[13px]">
              {stat.note}
            </p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="border-border bg-card rounded-lg border p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Your identity</p>
              <h2 className="font-display mt-3 text-2xl">Alex Morgan</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Product designer & thoughtful builder
              </p>
            </div>
            <Badge>Private</Badge>
          </div>
          <div className="mt-8 flex items-center gap-5">
            <div className="bg-muted text-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-medium ring-1 ring-black/5">
              AM
            </div>
            <div className="flex-1">
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Profile completion
                </span>
                <span className="font-medium">68%</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div className="bg-foreground h-full w-[68%] rounded-full" />
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                A few details will make your story shine.
              </p>
            </div>
          </div>
          <div className="border-border mt-7 border-t pt-4">
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="bg-success size-2 rounded-full" />
              Your profile is private and only visible to you
            </p>
          </div>
        </section>
        <section className="border-border bg-card flex flex-col rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Portfolio preview</p>
            <button
              aria-label="Open portfolio preview"
              className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-full p-1.5"
            >
              <ArrowUpRight className="size-4" />
            </button>
          </div>
          <div className="mt-4 flex min-h-40 flex-1 items-end rounded-2xl bg-gradient-to-br from-[#f1f1f4] to-[#dfe0e6] p-5">
            <div className="w-full border-b border-black/10 pb-3">
              <p className="font-display text-2xl">Alex Morgan</p>
              <p className="text-muted-foreground mt-1 text-xs">
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

      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-6 pb-5 md:px-8">
          <div>
            <h2 className="font-display text-xl">Your personas</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Different sides of your story, thoughtfully curated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/personas">Manage personas</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/personas/new">
                <Plus className="size-4" />
                New persona
              </Link>
            </Button>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="border-border bg-background/60 eyebrow hidden grid-cols-[2fr_1.4fr_1fr_auto] gap-4 border-y px-8 py-3 sm:grid"
        >
          <span>Persona</span>
          <span>Audience</span>
          <span>Content</span>
          <span>Status</span>
        </div>
        <div className="divide-border divide-y">
          {personas.map((persona) => (
            <article
              key={persona.name}
              className="grid grid-cols-[1fr_auto] items-center gap-4 px-6 py-5 sm:grid-cols-[2fr_1.4fr_1fr_auto] md:px-8"
            >
              <div className="flex items-center gap-3.5">
                <div className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                  {persona.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-medium">{persona.name}</h3>
                  <p className="text-muted-foreground mt-0.5 text-[13px]">
                    Example · {persona.detail} persona
                  </p>
                </div>
              </div>
              <span className="bg-muted hidden w-fit items-center gap-2 rounded-full px-3 py-1 font-mono text-xs sm:inline-flex">
                <span className="bg-success size-1.5 rounded-full" />
                {persona.audience}
              </span>
              <span className="text-muted-foreground hidden text-sm sm:block">
                {persona.sections}
              </span>
              <span className="text-sm font-medium">Sample</span>
            </article>
          ))}
        </div>
        <div className="border-border bg-background/60 text-muted-foreground border-t px-6 py-4 text-[13px] md:px-8">
          Showing 2 example personas
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl">A few highlights</h2>
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
              className="border-border bg-card overflow-hidden rounded-lg border p-2"
            >
              <div
                className={`h-28 rounded-[14px] bg-gradient-to-br ${item.tone}`}
              />
              <div className="px-3 pt-4 pb-3">
                <h3 className="text-[15px] font-medium">{item.title}</h3>
                <p className="text-muted-foreground mt-1 text-[13px]">
                  {item.detail}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="border-border bg-card flex items-start gap-3 rounded-lg border p-5">
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
          <Sparkles className="size-4" />
        </span>
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
