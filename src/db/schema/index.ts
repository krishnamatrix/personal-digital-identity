import {
  check,
  foreignKey,
  pgSchema,
  pgTable,
  pgPolicy,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// This is a reference to Supabase's managed Auth table. It is intentionally
// not exported, so Drizzle Kit does not treat auth.users as Folioone DDL.
const auth = pgSchema("auth");
const authUsers = auth.table("users", {
  id: uuid("id").primaryKey(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [authUsers.id],
      name: "accounts_id_auth_users_id_fk",
    }).onDelete("cascade"),
    pgPolicy("accounts_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`id = (SELECT auth.uid())`,
    }),
    pgPolicy("accounts_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`id = (SELECT auth.uid())`,
    }),
  ],
).enableRLS();

export const identityProfiles = pgTable(
  "identity_profiles",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    headline: text("headline"),
    summary: text("summary"),
    location: text("location"),
    websiteUrl: text("website_url"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "identity_profiles_display_name_length_check",
      sql`${table.displayName} IS NULL OR char_length(${table.displayName}) <= 120`,
    ),
    check(
      "identity_profiles_headline_length_check",
      sql`${table.headline} IS NULL OR char_length(${table.headline}) <= 180`,
    ),
    check(
      "identity_profiles_summary_length_check",
      sql`${table.summary} IS NULL OR char_length(${table.summary}) <= 2000`,
    ),
    check(
      "identity_profiles_location_length_check",
      sql`${table.location} IS NULL OR char_length(${table.location}) <= 160`,
    ),
    check(
      "identity_profiles_website_url_scheme_check",
      sql`${table.websiteUrl} IS NULL OR ${table.websiteUrl} ~ '^https?://'`,
    ),
    check(
      "identity_profiles_linkedin_url_scheme_check",
      sql`${table.linkedinUrl} IS NULL OR ${table.linkedinUrl} ~ '^https?://'`,
    ),
    check(
      "identity_profiles_github_url_scheme_check",
      sql`${table.githubUrl} IS NULL OR ${table.githubUrl} ~ '^https?://'`,
    ),
    pgPolicy("identity_profiles_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`${table.accountId} = (SELECT auth.uid())`,
    }),
    pgPolicy("identity_profiles_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`${table.accountId} = (SELECT auth.uid())`,
    }),
    pgPolicy("identity_profiles_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`${table.accountId} = (SELECT auth.uid())`,
      withCheck: sql`${table.accountId} = (SELECT auth.uid())`,
    }),
  ],
).enableRLS();
