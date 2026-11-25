"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DesignSurface } from "@/domains/designs/design-spec";
import { createDesignAction } from "./actions";
import { ChoiceSelect } from "./choice-select";

const NONE = "__none";

export function NewDesignForm({
  surface,
  categories,
  starters,
  aiAvailable,
}: {
  surface: DesignSurface;
  categories: string[];
  starters: { id: string; label: string }[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(categories[0]!);
  const [tier, setTier] = useState<"free" | "pro">("pro");
  const [startFrom, setStartFrom] = useState(NONE);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const usesAi = aiAvailable && prompt.trim().length > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    start(async () => {
      const r = await createDesignAction({
        surface,
        label,
        category,
        tier,
        startFrom: startFrom === NONE ? undefined : startFrom,
        prompt: usesAi ? prompt : "",
      });
      if (r.ok) router.push(`/admin/designs/${r.surface}/${r.id}`);
      else setMessage(r.message);
    });
  }

  return (
    <form
      onSubmit={submit}
      className="border-border bg-card space-y-4 rounded-lg border p-5 md:p-6"
      aria-labelledby="new-design-heading"
    >
      <h2 id="new-design-heading" className="text-base font-semibold">
        New {surface === "website" ? "website" : "digital card"} design
      </h2>
      <label className="block space-y-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          Describe the design
        </span>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={
            surface === "website"
              ? "e.g. A calm Scandinavian portfolio for an architect: off-white, charcoal text, one sage accent, a large serif name."
              : "e.g. A bold black card for a music producer with a neon green accent and monospace details."
          }
        />
        {!aiAvailable && (
          <span className="text-muted-foreground block text-xs">
            AI is not configured on this server, so the design starts as a copy
            of the starter you choose. You can edit every value by hand.
          </span>
        )}
      </label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Name {usesAi ? "(optional: the AI suggests one)" : ""}
          </span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            required={!usesAi}
          />
        </label>
        <ChoiceSelect
          label="Category"
          value={category}
          options={categories.map((c) => ({ value: c, label: c }))}
          onChange={setCategory}
        />
        <ChoiceSelect
          label="Plan"
          value={tier}
          options={[
            { value: "pro", label: "PRO only" },
            { value: "free", label: "Free for everyone" },
          ]}
          onChange={(v) => setTier(v as "free" | "pro")}
        />
        <ChoiceSelect
          label="Start from"
          value={startFrom}
          options={[
            {
              value: NONE,
              label: usesAi ? "Nothing (AI decides)" : "Default starter",
            },
            ...starters.map((s) => ({ value: s.id, label: s.label })),
          ]}
          onChange={setStartFrom}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {usesAi && <Sparkles className="size-4" aria-hidden />}
          {pending
            ? usesAi
              ? "Designing…"
              : "Creating…"
            : usesAi
              ? "Create with AI"
              : "Create draft"}
        </Button>
        {message && (
          <p role="alert" className="text-danger text-sm">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
