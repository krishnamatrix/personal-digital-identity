"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { ChatCardFace } from "@/components/chatcards/chat-card-face";
import {
  ACCESS_POLICIES,
  ACCESS_POLICY_LABELS,
  LIMITS,
  type AccessPolicy,
  type ChatCard,
  type LinkKind,
} from "@/domains/chatcards/chat-card-schema";
import type {
  EditorContext,
  IssuedBatch,
} from "@/domains/chatcards/chat-card-service";
import {
  changeChatCardStatusAction,
  createChatCardAction,
  generateCodesAction,
  saveChatCardAction,
} from "@/app/chatcards/actions";
import { ChatCardShare } from "@/app/chatcards/chat-card-share";
import { IssuedCodes } from "@/app/chatcards/issued-codes";
import { cn } from "@/lib/utils";

export type FormState = {
  title: string;
  description: string;
  hostName: string;
  welcomeMessage: string;
  coverImageUrl: string;
  personaId: string;
  linkKind: "" | LinkKind;
  accessPolicy: AccessPolicy;
  autoAccept: boolean;
  acceptingNew: boolean;
  allowFollowUps: boolean;
  maxActive: string;
  maxPerRecipient: string;
  expiresOn: string;
};

type BatchState = {
  count: string;
  singleUse: boolean;
  usesPerCode: string;
  expiresOn: string;
  label: string;
};

export function formFromCard(
  card: ChatCard | null,
  hostName: string,
): FormState {
  return {
    title: card?.title ?? "",
    description: card?.description ?? "",
    hostName: card?.hostName ?? hostName,
    welcomeMessage: card?.welcomeMessage ?? "",
    coverImageUrl: card?.coverImageUrl ?? "",
    personaId: card?.personaId ?? "",
    linkKind: card?.linkKind ?? "",
    accessPolicy: card?.accessPolicy ?? "approval",
    autoAccept: card?.autoAccept ?? false,
    acceptingNew: card?.acceptingNew ?? true,
    allowFollowUps: card?.allowFollowUps ?? true,
    maxActive: card?.maxActiveConversations
      ? String(card.maxActiveConversations)
      : "",
    maxPerRecipient: String(card?.maxConversationsPerRecipient ?? 1),
    expiresOn: card?.expiresAt ? card.expiresAt.slice(0, 10) : "",
  };
}

export function toInput(f: FormState) {
  const int = (s: string) => (s.trim() === "" ? null : Number.parseInt(s, 10));
  return {
    title: f.title,
    description: f.description,
    hostName: f.hostName,
    welcomeMessage: f.welcomeMessage,
    coverImageUrl: f.coverImageUrl,
    personaId: f.personaId || null,
    linkKind: f.linkKind || null,
    accessPolicy: f.accessPolicy,
    autoAccept: f.accessPolicy === "approval" ? false : f.autoAccept,
    acceptingNew: f.acceptingNew,
    allowFollowUps: f.allowFollowUps,
    maxActiveConversations: int(f.maxActive),
    maxConversationsPerRecipient: int(f.maxPerRecipient) ?? 1,
    expiresOn: f.expiresOn,
  };
}

/** Field-level problems the person can fix before sending (the server checks again). */
export function problemsOf(f: FormState, step: number | "all"): string[] {
  const out: string[] = [];
  const at = (n: number) => step === "all" || step === n;
  if (at(1)) {
    if (!f.title.trim()) out.push("Give the card a title.");
    if (!f.hostName.trim()) out.push("Add the name people will see.");
    if (
      f.coverImageUrl.trim() &&
      !/^https:\/\/\S+$/.test(f.coverImageUrl.trim())
    )
      out.push("The cover image must be an https:// address.");
  }
  if (at(3)) {
    const per = Number(f.maxPerRecipient);
    if (!Number.isInteger(per) || per < 1 || per > LIMITS.maxPerRecipient)
      out.push(`Conversations per person: 1 to ${LIMITS.maxPerRecipient}.`);
    if (f.maxActive.trim()) {
      const n = Number(f.maxActive);
      if (!Number.isInteger(n) || n < 1 || n > LIMITS.maxActive)
        out.push(
          `Active conversations: 1 to ${LIMITS.maxActive}, or leave empty.`,
        );
    }
  }
  return out;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p
          id={`${id}-hint`}
          className="text-muted-foreground text-xs leading-5"
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p className="text-muted-foreground text-xs leading-5">{hint}</p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
    </div>
  );
}

export function BasicsFields({
  form,
  set,
  context,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  context: EditorContext;
}) {
  return (
    <div className="space-y-5">
      <Field
        id="cc-title"
        label="Title"
        hint="For example: Ask the Author, Office hours, Book a mentoring chat."
      >
        <Input
          id="cc-title"
          value={form.title}
          maxLength={LIMITS.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field
        id="cc-host"
        label="Name shown to people"
        hint="Only this name is shown. Your Master Identity, email and phone stay private."
      >
        <Input
          id="cc-host"
          value={form.hostName}
          maxLength={LIMITS.hostName}
          onChange={(e) => set({ hostName: e.target.value })}
        />
      </Field>
      <Field
        id="cc-description"
        label="Description"
        hint="What can people talk to you about?"
      >
        <Textarea
          id="cc-description"
          value={form.description}
          maxLength={LIMITS.description}
          rows={3}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      <Field
        id="cc-welcome"
        label="Welcome message"
        hint="Shown on the card before someone writes."
      >
        <Textarea
          id="cc-welcome"
          value={form.welcomeMessage}
          maxLength={LIMITS.welcome}
          rows={3}
          onChange={(e) => set({ welcomeMessage: e.target.value })}
        />
      </Field>
      <Field
        id="cc-cover"
        label="Cover image address (optional)"
        hint="An https:// image link, e.g. your book cover."
      >
        <Input
          id="cc-cover"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={form.coverImageUrl}
          maxLength={LIMITS.coverUrl}
          onChange={(e) => set({ coverImageUrl: e.target.value })}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="cc-persona"
          label="Persona (optional)"
          hint="For your own organisation. Not shown publicly."
        >
          <select
            id="cc-persona"
            className="border-border bg-card h-10 w-full rounded-xl border px-3 text-sm"
            value={form.personaId}
            onChange={(e) => set({ personaId: e.target.value })}
          >
            <option value="">No Persona</option>
            {context.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="cc-link"
          label="Link on the card (optional)"
          hint="Only your live pages can be linked."
        >
          <select
            id="cc-link"
            className="border-border bg-card h-10 w-full rounded-xl border px-3 text-sm"
            value={form.linkKind}
            onChange={(e) =>
              set({ linkKind: e.target.value as FormState["linkKind"] })
            }
          >
            <option value="">No link</option>
            <option value="website" disabled={!context.links.website}>
              My website{context.links.website ? "" : " (not published)"}
            </option>
            <option value="card" disabled={!context.links.card}>
              My digital card{context.links.card ? "" : " (not published)"}
            </option>
          </select>
        </Field>
      </div>
    </div>
  );
}

export function AccessFields({
  form,
  set,
  batch,
  setBatch,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  batch?: BatchState;
  setBatch?: (patch: Partial<BatchState>) => void;
}) {
  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          Who can start a conversation?
        </legend>
        <div className="grid gap-3" role="radiogroup">
          {ACCESS_POLICIES.map((p) => (
            <label
              key={p}
              className={cn(
                "border-border bg-card flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors",
                form.accessPolicy === p &&
                  "border-foreground ring-foreground/10 ring-2",
              )}
            >
              <input
                type="radio"
                name="access-policy"
                value={p}
                checked={form.accessPolicy === p}
                onChange={() =>
                  set({
                    accessPolicy: p,
                    autoAccept: p === "approval" ? false : form.autoAccept,
                  })
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold">
                  {ACCESS_POLICY_LABELS[p].title}
                </span>
                <span className="text-muted-foreground block text-sm leading-6">
                  {ACCESS_POLICY_LABELS[p].summary}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {form.accessPolicy === "open" && (
        <Toggle
          id="cc-auto-open"
          label="Start conversations automatically"
          hint="Off: you approve each request first."
          checked={form.autoAccept}
          onChange={(v) => set({ autoAccept: v })}
        />
      )}
      {form.accessPolicy === "verified" && (
        <div className="space-y-5">
          <Toggle
            id="cc-approve-verified"
            label="Also approve each request"
            hint="On: a valid code lets someone ask; you still accept before messaging begins."
            checked={!form.autoAccept}
            onChange={(v) => set({ autoAccept: !v })}
          />
          {batch && setBatch && (
            <div className="bg-muted/50 space-y-4 rounded-2xl p-4">
              <p className="text-sm font-semibold">
                First batch of activation codes
              </p>
              <p className="text-muted-foreground text-xs leading-5">
                Each code is random and unique. You see them once, right after
                the card is created, to download for printing. You can add more
                batches later.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="cc-batch-label" label="Batch name">
                  <Input
                    id="cc-batch-label"
                    value={batch.label}
                    maxLength={LIMITS.batchLabel}
                    onChange={(e) => setBatch({ label: e.target.value })}
                  />
                </Field>
                <Field
                  id="cc-batch-count"
                  label="Number of codes"
                  hint={`Up to ${LIMITS.batchSize} per batch. 0 to skip.`}
                >
                  <Input
                    id="cc-batch-count"
                    type="number"
                    min={0}
                    max={LIMITS.batchSize}
                    value={batch.count}
                    onChange={(e) => setBatch({ count: e.target.value })}
                  />
                </Field>
              </div>
              <Toggle
                id="cc-single-use"
                label="Each code works once"
                hint="Recommended: one code per book, ticket or customer."
                checked={batch.singleUse}
                onChange={(v) => setBatch({ singleUse: v })}
              />
              {!batch.singleUse && (
                <Field
                  id="cc-batch-uses"
                  label="People per code"
                  hint={`Up to ${LIMITS.usesPerCode}.`}
                >
                  <Input
                    id="cc-batch-uses"
                    type="number"
                    min={2}
                    max={LIMITS.usesPerCode}
                    value={batch.usesPerCode}
                    onChange={(e) => setBatch({ usesPerCode: e.target.value })}
                  />
                </Field>
              )}
              <Field id="cc-batch-expiry" label="Codes expire (optional)">
                <DatePicker
                  id="cc-batch-expiry"
                  value={batch.expiresOn}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(v) => setBatch({ expiresOn: v })}
                  placeholder="Never"
                />
              </Field>
            </div>
          )}
          <p className="text-muted-foreground text-xs leading-5">
            A code shows that someone holds one of your codes, not that they
            bought the product: codes can be passed on. Printed QR codes alone
            never grant access.
          </p>
        </div>
      )}
    </div>
  );
}

export function ConversationFields({
  form,
  set,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-5">
      <Toggle
        id="cc-accepting"
        label="New conversations enabled"
        hint="Turn off to stop new requests while keeping the card visible."
        checked={form.acceptingNew}
        onChange={(v) => set({ acceptingNew: v })}
      />
      <Toggle
        id="cc-followups"
        label="People can send follow-up messages"
        hint="Off: after each message, they wait for your reply before writing again."
        checked={form.allowFollowUps}
        onChange={(v) => set({ allowFollowUps: v })}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="cc-per-person"
          label="Conversations per person"
          hint="Over the life of the card."
        >
          <Input
            id="cc-per-person"
            type="number"
            min={1}
            max={LIMITS.maxPerRecipient}
            value={form.maxPerRecipient}
            onChange={(e) => set({ maxPerRecipient: e.target.value })}
          />
        </Field>
        <Field
          id="cc-max-active"
          label="Most active conversations (optional)"
          hint={
            form.autoAccept
              ? "Applies when you approve requests."
              : "You cannot accept more than this at once."
          }
        >
          <Input
            id="cc-max-active"
            type="number"
            min={1}
            max={LIMITS.maxActive}
            placeholder="No limit"
            value={form.maxActive}
            onChange={(e) => set({ maxActive: e.target.value })}
          />
        </Field>
      </div>
      <Field
        id="cc-expiry"
        label="Invitation ends (optional)"
        hint="After this day no new conversations can start."
      >
        <DatePicker
          id="cc-expiry"
          value={form.expiresOn}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(v) => set({ expiresOn: v })}
          placeholder="Never"
        />
      </Field>
      <p className="text-muted-foreground text-xs leading-5">
        You can pause the card at any time from your ChatCards list. Folioone
        never promises people a reply or a response time on your behalf.
      </p>
    </div>
  );
}

const STEPS = [
  "Basics",
  "Access",
  "Conversations",
  "Preview & publish",
] as const;

/** The guided four-step creation flow. */
export function ChatCardWizard({
  context,
  origin,
}: {
  context: EditorContext;
  origin: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() =>
    formFromCard(null, context.defaultHostName),
  );
  const [batch, setBatchState] = useState<BatchState>({
    count: "100",
    singleUse: true,
    usesPerCode: "2",
    expiresOn: "",
    label: "First print run",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{
    id: string;
    publicId: string;
    published: boolean;
    batch: IssuedBatch | null;
    warning: string | null;
  } | null>(null);
  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));
  const setBatch = (patch: Partial<BatchState>) =>
    setBatchState((b) => ({ ...b, ...patch }));

  const next = () => {
    const p = problemsOf(form, step);
    setErrors(p);
    if (!p.length) setStep((s) => Math.min(4, s + 1));
  };

  function finish(publish: boolean) {
    const p = problemsOf(form, "all");
    setErrors(p);
    if (p.length) return;
    start(async () => {
      const created = await createChatCardAction(toInput(form));
      if (!created.ok) {
        setErrors([created.message]);
        return;
      }
      const { id, publicId } = created.data;
      let issued: IssuedBatch | null = null;
      let warning: string | null = null;
      const count = Number.parseInt(batch.count, 10) || 0;
      if (form.accessPolicy === "verified" && count > 0) {
        const r = await generateCodesAction(id, {
          label: batch.label || "First batch",
          count,
          usesPerCode: batch.singleUse
            ? 1
            : Number.parseInt(batch.usesPerCode, 10) || 2,
          expiresOn: batch.expiresOn,
        });
        if (r.ok) issued = r.data;
        else
          warning = `The card was created, but the codes were not: ${r.message} You can generate them from the card's Codes tab.`;
      }
      let published = false;
      if (publish) {
        const r = await changeChatCardStatusAction(id, "publish");
        published = r.ok;
        if (!r.ok)
          warning = `${warning ? `${warning} ` : ""}Not published: ${r.message}`;
      }
      setDone({ id, publicId, published, batch: issued, warning });
      router.refresh();
    });
  }

  if (done)
    return (
      <section className="max-w-3xl space-y-6" data-testid="chatcard-created">
        <header>
          <p className="eyebrow">ChatCards</p>
          <h1 className="font-display mt-2 text-3xl">
            {done.published ? "Your ChatCard is live" : "Saved as a draft"}
          </h1>
        </header>
        {done.warning && (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger rounded-xl border px-4 py-2.5 text-sm"
          >
            {done.warning}
          </p>
        )}
        {done.batch && (
          <IssuedCodes
            batch={done.batch}
            cardTitle={form.title}
            url={`${origin}/chat/${done.publicId}`}
          />
        )}
        {done.published && (
          <ChatCardShare
            url={`${origin}/chat/${done.publicId}`}
            title={form.title}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/chatcards/${done.id}`}>Manage this card</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/chatcards">All ChatCards</Link>
          </Button>
        </div>
      </section>
    );

  return (
    <section className="max-w-3xl space-y-6" data-testid="chatcard-wizard">
      <header>
        <Link
          href="/chatcards"
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> ChatCards
        </Link>
        <h1 className="font-display mt-3 text-3xl md:text-[2.25rem]">
          New ChatCard
        </h1>
      </header>
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
              step === i + 1
                ? "border-foreground bg-foreground text-background"
                : step > i + 1
                  ? "border-border bg-card"
                  : "border-border text-muted-foreground",
            )}
          >
            {step > i + 1 ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <span>{i + 1}</span>
            )}
            {label}
          </li>
        ))}
      </ol>

      <div className="border-border bg-card rounded-[20px] border p-5 sm:p-7">
        <h2 className="mb-5 text-lg font-semibold">{STEPS[step - 1]}</h2>
        {step === 1 && <BasicsFields form={form} set={set} context={context} />}
        {step === 2 && (
          <AccessFields
            form={form}
            set={set}
            batch={batch}
            setBatch={setBatch}
          />
        )}
        {step === 3 && <ConversationFields form={form} set={set} />}
        {step === 4 && (
          <div className="space-y-5">
            <p className="text-muted-foreground text-sm leading-6">
              This is what people see when they open your link or scan its QR
              code.
            </p>
            <div className="bg-background rounded-2xl p-3 sm:p-6">
              <ChatCardFace
                title={form.title || "Your title"}
                hostName={form.hostName || "Your name"}
                description={form.description.trim() || null}
                welcomeMessage={form.welcomeMessage.trim() || null}
                coverImageUrl={
                  /^https:\/\//.test(form.coverImageUrl)
                    ? form.coverImageUrl
                    : null
                }
                accessPolicy={form.accessPolicy}
                autoAccept={
                  form.accessPolicy === "approval" ? false : form.autoAccept
                }
                className="mx-auto max-w-lg"
              />
            </div>
          </div>
        )}
        {errors.length > 0 && (
          <ul
            role="alert"
            className="text-danger mt-5 list-disc space-y-1 pl-5 text-sm"
          >
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="outline"
          disabled={step === 1 || pending}
          onClick={() => setStep((s) => s - 1)}
        >
          <ArrowLeft aria-hidden className="size-4" /> Back
        </Button>
        {step < 4 ? (
          <Button onClick={next}>
            Next <ArrowRight aria-hidden className="size-4" />
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              pending={pending}
              onClick={() => finish(false)}
            >
              Save as draft
            </Button>
            <Button pending={pending} onClick={() => finish(true)}>
              Publish ChatCard
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Editing an existing card: the same fields, as sections, with one Save. */
export function ChatCardEditForm({
  card,
  context,
}: {
  card: ChatCard;
  context: EditorContext;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => formFromCard(card, context.defaultHostName),
    [card, context.defaultHostName],
  );
  const [form, setForm] = useState<FormState>(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string[] } | null>(
    null,
  );
  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const p = problemsOf(form, "all");
        if (p.length) return setResult({ ok: false, text: p });
        start(async () => {
          const r = await saveChatCardAction(card.id, toInput(form));
          setResult({
            ok: r.ok,
            text: [r.ok ? (r.message ?? "Saved.") : r.message],
          });
          if (r.ok) router.refresh();
        });
      }}
    >
      {[
        {
          title: "Basics",
          body: <BasicsFields form={form} set={set} context={context} />,
        },
        { title: "Access", body: <AccessFields form={form} set={set} /> },
        {
          title: "Conversations",
          body: <ConversationFields form={form} set={set} />,
        },
      ].map((s) => (
        <section
          key={s.title}
          className="border-border bg-card rounded-[20px] border p-5 sm:p-7"
        >
          <h2 className="mb-5 text-lg font-semibold">{s.title}</h2>
          {s.body}
        </section>
      ))}
      {result && (
        <ul
          role={result.ok ? "status" : "alert"}
          className={cn(
            "space-y-1 text-sm",
            result.ok ? "text-success" : "text-danger",
          )}
        >
          {result.text.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending} disabled={!dirty}>
          Save changes
        </Button>
        {card.status === "active" || card.status === "paused" ? (
          <p className="text-muted-foreground self-center text-xs">
            Changes appear on the live card as soon as you save.
          </p>
        ) : null}
      </div>
    </form>
  );
}
