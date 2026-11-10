import {
  ENTRY_KIND_DEFS,
  entrySubtitle,
  entryTitle,
  type EntryItem,
  type EntryKind,
} from "@/domains/identity/entry-kinds";

export type PreviewProfile = {
  fullName: string | null;
  displayName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  websiteUrl: string | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  contactEmail: string | null;
  phone: string | null;
  currentDesignation: string | null;
  currentOrganization: string | null;
  industry: string | null;
  professionalSummary: string | null;
};

type Entries = Partial<Record<EntryKind, EntryItem[]>>;

const visible = (entries: Entries, kind: EntryKind) =>
  (entries[kind] ?? []).filter((e) => e.isVisible);

const MAX_PREVIEW_IMAGES = 4;

function monthLabel(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return "";
  const [y, m] = value.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString(
    "en",
    {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}

function dateRange(d: Record<string, unknown>) {
  const start = monthLabel(d.startDate);
  const end = d.isCurrent === true ? "Present" : monthLabel(d.endDate);
  return [start, end].filter(Boolean).join(" – ");
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

/** Read-only presentation of the SAVED profile. Hidden items are not shown. */
export function ProfilePreview({
  profile,
  entries,
}: {
  profile: PreviewProfile;
  entries: Entries;
}) {
  const name = profile.displayName || profile.fullName;
  const role = [profile.currentDesignation, profile.currentOrganization]
    .filter(Boolean)
    .join(" at ");
  const empty =
    !name &&
    !profile.headline &&
    !profile.summary &&
    Object.values(entries).every((l) => !l?.length);

  if (empty) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        <p className="text-foreground font-medium">Nothing to preview yet</p>
        <p className="mt-1">
          Fill in a few sections and save them to see your profile here.
        </p>
      </div>
    );
  }

  const groups: [EntryKind, string][] = [
    ["employment", "Experience"],
    ["education", "Education"],
  ];

  return (
    <article
      className="border-border bg-card overflow-hidden rounded-lg border"
      aria-label="Profile preview"
    >
      <div className="bg-muted h-32 md:h-44">
        {profile.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <div className="space-y-8 px-6 pb-8 md:px-10">
        <header className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end">
          <div className="border-card bg-muted size-24 shrink-0 overflow-hidden rounded-full border-4">
            {profile.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.profileImageUrl}
                alt={name ? `${name}` : "Profile"}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-muted-foreground font-display flex h-full items-center justify-center text-3xl">
                {(name ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-3xl">{name ?? "Your name"}</h2>
            {profile.headline && (
              <p className="text-muted-foreground mt-1">{profile.headline}</p>
            )}
            <p className="text-muted-foreground mt-1 text-sm">
              {[profile.location, profile.contactEmail, profile.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>

        {profile.summary && (
          <p className="max-w-3xl text-sm leading-7 whitespace-pre-line">
            {profile.summary}
          </p>
        )}

        {(role || profile.industry || profile.professionalSummary) && (
          <Section title="Professional">
            {role && <p className="font-medium">{role}</p>}
            {profile.industry && (
              <p className="text-muted-foreground text-sm">
                {profile.industry}
              </p>
            )}
            {profile.professionalSummary && (
              <p className="max-w-3xl text-sm leading-7 whitespace-pre-line">
                {profile.professionalSummary}
              </p>
            )}
          </Section>
        )}

        {groups.map(([kind, title]) => {
          const list = visible(entries, kind);
          if (!list.length) return null;
          return (
            <Section key={kind} title={title}>
              <ul className="space-y-4">
                {list.map((item) => (
                  <li key={item.id}>
                    <p className="font-medium">{entryTitle(kind, item.data)}</p>
                    <p className="text-muted-foreground text-sm">
                      {entrySubtitle(kind, item.data)}
                    </p>
                    {dateRange(item.data) && (
                      <p className="text-muted-foreground text-xs">
                        {dateRange(item.data)}
                      </p>
                    )}
                    {typeof item.data.description === "string" && (
                      <p className="mt-1 text-sm leading-6 whitespace-pre-line">
                        {item.data.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}

        {visible(entries, "skill").length > 0 && (
          <Section title="Skills">
            <ul className="flex flex-wrap gap-2">
              {visible(entries, "skill").map((s) => (
                <li
                  key={s.id}
                  className="bg-muted rounded-full px-3 py-1 text-xs"
                >
                  {entryTitle("skill", s.data)}
                  {typeof s.data.category === "string" && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {s.data.category}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {visible(entries, "project").length > 0 && (
          <Section title="Projects">
            <ul className="grid gap-4 md:grid-cols-2">
              {visible(entries, "project").map((p) => (
                <li
                  key={p.id}
                  className="border-border space-y-2 rounded-lg border p-4"
                >
                  <p className="font-medium">{entryTitle("project", p.data)}</p>
                  {typeof p.data.role === "string" && (
                    <p className="text-muted-foreground text-xs">
                      {p.data.role}
                    </p>
                  )}
                  {typeof p.data.description === "string" && (
                    <p className="text-sm leading-6">{p.data.description}</p>
                  )}
                  {Array.isArray(p.data.technologies) && (
                    <p className="text-muted-foreground text-xs">
                      {p.data.technologies.join(" · ")}
                    </p>
                  )}
                  {Array.isArray(p.data.images) && p.data.images.length > 0 && (
                    <div className="flex gap-2">
                      {p.data.images.slice(0, MAX_PREVIEW_IMAGES).map((src) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={src}
                          src={src}
                          alt=""
                          className="h-16 w-24 rounded object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ))}
                    </div>
                  )}
                  {typeof p.data.url === "string" && (
                    <a
                      href={p.data.url}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      className="text-accent text-xs underline"
                    >
                      {p.data.url}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(visible(entries, "social_link").length > 0 || profile.websiteUrl) && (
          <Section title="Links">
            <ul className="space-y-1 text-sm">
              {profile.websiteUrl && (
                <li>
                  <a
                    href={profile.websiteUrl}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="text-accent underline"
                  >
                    Personal website
                  </a>
                </li>
              )}
              {visible(entries, "social_link").map((l) => (
                <li key={l.id}>
                  <a
                    href={String(l.data.url)}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="text-accent underline"
                  >
                    {entryTitle("social_link", l.data)}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(
          [
            "achievement",
            "certification",
            "language",
            "interest",
          ] as EntryKind[]
        ).map((kind) => {
          const list = visible(entries, kind);
          if (!list.length) return null;
          return (
            <Section key={kind} title={ENTRY_KIND_DEFS[kind].label}>
              <ul className="space-y-1 text-sm">
                {list.map((i) => (
                  <li key={i.id}>
                    {entryTitle(kind, i.data)}
                    {entrySubtitle(kind, i.data) && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {entrySubtitle(kind, i.data)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}
      </div>
    </article>
  );
}
