import { z } from "zod";

/**
 * ChatCards: pure rules shared by the UI, the server and tests. The limits match the CHECK
 * constraints in docs/sql/milestone-chatcards/002-chatcards.sql (a test keeps them in step).
 */

export const ACCESS_POLICIES = ["open", "approval", "verified"] as const;
export type AccessPolicy = (typeof ACCESS_POLICIES)[number];

export const CARD_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type StoredCardStatus = (typeof CARD_STATUSES)[number];
/** What the owner sees: a card past its expiry date shows as Expired. */
export type CardStatus = StoredCardStatus | "expired";

export const LINK_KINDS = ["website", "card"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LIMITS = {
  title: 120,
  description: 1000,
  hostName: 80,
  welcome: 1000,
  coverUrl: 2000,
  maxActive: 10_000,
  maxPerRecipient: 20,
  message: 2000,
  recipientName: 80,
  batchLabel: 80,
  batchSize: 500,
  usesPerCode: 25,
  reportDetails: 1000,
  messagePage: 50,
} as const;

export const ACCESS_POLICY_LABELS: Record<
  AccessPolicy,
  { title: string; summary: string }
> = {
  open: {
    title: "Open invitation",
    summary: "Anyone with the link can start a conversation.",
  },
  approval: {
    title: "Approval required",
    summary: "Anyone can ask. You accept before messaging begins.",
  },
  verified: {
    title: "Verified access",
    summary:
      "People enter a unique activation code first: for readers, attendees or customers.",
  },
};

export const STATUS_LABELS: Record<CardStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  archived: "Archived",
};

const text = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(max));
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => (s ?? "").trim())
    .pipe(z.string().max(max))
    .transform((s) => (s === "" ? null : s));

/** A day (YYYY-MM-DD) or empty; stored as the END of that day, UTC. */
const optionalDay = z
  .string()
  .nullish()
  .transform((s) => (s ?? "").trim())
  .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "Use a date.")
  .transform((s) => (s === "" ? null : `${s}T23:59:59.000Z`));

export const chatCardInputSchema = z
  .object({
    title: text(LIMITS.title).pipe(z.string().min(1, "Give the card a title.")),
    description: optionalText(LIMITS.description),
    hostName: text(LIMITS.hostName).pipe(
      z.string().min(1, "Add the name people will see."),
    ),
    welcomeMessage: optionalText(LIMITS.welcome),
    coverImageUrl: optionalText(LIMITS.coverUrl).refine(
      (v) => v === null || /^https:\/\/[^\s]+$/.test(v),
      "Use an https:// image address.",
    ),
    personaId: z.uuid().nullish().default(null),
    linkKind: z.enum(LINK_KINDS).nullish().default(null),
    accessPolicy: z.enum(ACCESS_POLICIES),
    autoAccept: z.boolean(),
    acceptingNew: z.boolean().default(true),
    allowFollowUps: z.boolean().default(true),
    maxActiveConversations: z
      .number()
      .int()
      .min(1)
      .max(LIMITS.maxActive)
      .nullish()
      .default(null),
    maxConversationsPerRecipient: z
      .number()
      .int()
      .min(1)
      .max(LIMITS.maxPerRecipient)
      .default(1),
    expiresOn: optionalDay,
  })
  // Approval required means exactly that: never automatic.
  .transform((v) => ({
    ...v,
    autoAccept: v.accessPolicy === "approval" ? false : v.autoAccept,
  }));

export type ChatCardInput = z.input<typeof chatCardInputSchema>;
export type ChatCardValues = z.output<typeof chatCardInputSchema>;

export type ChatCard = {
  id: string;
  publicId: string;
  status: StoredCardStatus;
  title: string;
  description: string | null;
  hostName: string;
  welcomeMessage: string | null;
  coverImageUrl: string | null;
  personaId: string | null;
  linkKind: LinkKind | null;
  accessPolicy: AccessPolicy;
  autoAccept: boolean;
  acceptingNew: boolean;
  allowFollowUps: boolean;
  maxActiveConversations: number | null;
  maxConversationsPerRecipient: number;
  expiresAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function effectiveStatus(
  card: Pick<ChatCard, "status" | "expiresAt">,
  now: Date = new Date(),
): CardStatus {
  if (
    (card.status === "active" || card.status === "paused") &&
    card.expiresAt &&
    new Date(card.expiresAt).getTime() <= now.getTime()
  )
    return "expired";
  return card.status;
}

/** Plain-language summary of who can start a conversation and how. */
export function describeAccess(
  card: Pick<
    ChatCard,
    "accessPolicy" | "autoAccept" | "maxConversationsPerRecipient"
  >,
): string {
  const how =
    card.accessPolicy === "verified"
      ? "Activation code required"
      : card.accessPolicy === "approval"
        ? "Anyone can ask"
        : "Anyone with the link";
  const accept = card.autoAccept ? "starts at once" : "you approve each one";
  return `${how} · ${accept}`;
}

/** The public card as a visitor sees it (from the snapshot; never account ids or contact details). */
export type PublicChatCard = {
  cardId: string;
  publicId: string;
  status: "active" | "paused" | "archived";
  title: string;
  description: string | null;
  hostName: string;
  welcomeMessage: string | null;
  coverImageUrl: string | null;
  linkPath: string | null;
  accessPolicy: AccessPolicy;
  autoAccept: boolean;
  acceptingNew: boolean;
  allowFollowUps: boolean;
  maxConversationsPerRecipient: number;
  expiresAt: string | null;
  ownerProActive: boolean;
  isOwner: boolean;
};

/** Why a public card cannot take a new conversation right now (null: it can). */
export type Availability =
  | "open"
  | "paused"
  | "expired"
  | "closed"
  | "unavailable";

export function availabilityOf(
  card: PublicChatCard | null,
  now: Date = new Date(),
): Availability {
  if (!card || card.status === "archived" || !card.ownerProActive)
    return "unavailable";
  if (card.expiresAt && new Date(card.expiresAt).getTime() <= now.getTime())
    return "expired";
  if (card.status === "paused") return "paused";
  if (!card.acceptingNew) return "closed";
  return "open";
}

export const messageSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, "Write a message first.")
      .max(LIMITS.message, `Keep it under ${LIMITS.message} characters.`),
  );

export const recipientNameSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Tell them your name.")
      .max(LIMITS.recipientName, "Use a shorter name."),
  );

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "inappropriate",
  "impersonation",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or advertising",
  harassment: "Harassment or threats",
  inappropriate: "Inappropriate content",
  impersonation: "Pretending to be someone else",
  other: "Something else",
};

export const codeBatchSchema = z.object({
  label: text(LIMITS.batchLabel).pipe(z.string().min(1, "Name this batch.")),
  count: z.number().int().min(1).max(LIMITS.batchSize),
  usesPerCode: z.number().int().min(1).max(LIMITS.usesPerCode).default(1),
  expiresOn: optionalDay,
});
export type CodeBatchInput = z.input<typeof codeBatchSchema>;

export const publicIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
