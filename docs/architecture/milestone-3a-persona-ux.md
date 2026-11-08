# Milestone 3A — Persona UX Specification

**Status:** Design only. No routes or components are implemented.

Use the existing approved workspace direction: warm ivory/off-white content, matte charcoal navigation, serif editorial headings, modern sans-serif body, subtle borders, restrained warm accents and generous whitespace. Keep the workspace functional and calm; avoid generic admin dashboards, purple gradients, neon and excessive glass effects.

## Information architecture

Use approved terms in the existing navigation: **My Identity**, **Personas**, **My Portfolio**, **Projects**, **Highlights**, **Timeline**, **Articles & Thoughts**, **Digital Cards**, **CV Studio**, **AI Suggestions**, **Privacy & Sharing**. “Personas” is a curation workspace, not a resume template gallery. Display audience/purpose labels as user-authored descriptions; Professional, Founder, Academic, Creative and Speaker are optional starter suggestions, never required types.

## Screens

### Persona list

- Page heading “Personas” and a short explanation that each Persona presents selected parts of My Identity for a particular audience.
- Editorial cards or a compact list with name, audience, purpose, status, default marker, last updated date and a restrained preview of selected sections. No canonical private values are shown in a public context.
- Primary action “Create Persona”; item actions Edit, Preview, Set as default, Duplicate, Archive/Restore, Delete. Destructive delete is separated from archive and explains that canonical My Identity data remains.
- Empty state explains that creating a Persona does not change My Identity or publish anything. It offers optional examples and a blank custom Persona.
- Archived filter is available; archived rows are clearly labeled and cannot be default or published.

### Create flow

1. **Describe it:** required name; optional audience, purpose and description; user-created wording. Show optional suggestions, not mandatory categories.
2. **Choose content:** sections start private/hidden and content defaults excluded. Provide clear “include” controls with canonical item identity visible to the owner. Current implementation begins with profile-field selection; future categories use the same selection vocabulary while their typed records are added.
3. **Shape presentation:** Persona-specific headline and summary, with “Use My Identity value” / “Write for this Persona” modes and a clear reset control. Indicate override provenance and show when a field is intentionally blank.
4. **Review:** preview resolved content, selection count, excluded items and any archived/unavailable source. Save creates an active private Persona, non-default unless user explicitly chooses otherwise.

### Edit and content selection

- Tabs/steps: **Details**, **Content**, **Presentation**, **Preview**. Preserve entered changes while moving between steps.
- Content panels group future domain items into named sections (Experience, Education, Skills, Projects, Highlights, Timeline, Publications, Articles & Thoughts). Each item can be included/excluded, ordered and highlighted. Newly added canonical records remain excluded until chosen.
- Users can reorder sections and selected records, hide an entire section, and rename a section label without changing canonical content.
- Source status is visible: current, archived, or unavailable. Archived source content is not rendered in preview; user may restore the source in My Identity or remove its Persona selection.
- Bulk actions must be scoped to the current category and show a confirmation summary. No “publish” affordance appears in this milestone.

### Preview

- Preview the Persona as a coherent audience-facing expression in a desktop/mobile frame. The preview is private and labeled “Only you can see this preview”.
- Show value provenance in an owner-only inspector: “From My Identity” or “Persona-specific version”. Do not expose internal IDs.
- Preview uses the same effective-content resolver planned for Portfolio, Digital Cards and CV Studio; future consumers may change layout but not inclusion/override semantics.
- Empty content and excluded canonical data are explained without nudging the user toward public sharing.

### Default, archive, restore and delete

- Setting a default is explicit and has a single confirmation/action. A user may have no default; at most one active Persona is default.
- Archiving warns that the Persona is hidden from active workflows, clears default if set, and preserves its configuration. Restoring returns it as active but not default.
- Delete is a separate final action after archive or direct explicit confirmation. Explain that only Persona settings/selections/overrides/history are removed; My Identity records remain. If future Portfolios or Cards depend on it, show the blocking dependency and require the user to detach those consumers first.

## Primary journeys

### Create a Founder Persona

From Personas, select Create; name it “Founder”; add audience/purpose; select only relevant profile fields and later project/experience records; write an optional headline override; review provenance and private preview; save. My Identity remains unchanged and the Persona stays private/non-default unless selected.

### Adapt an existing Persona after a Master Identity update

Update a canonical project in My Identity. A Persona without an override resolves the changed value. A Persona-specific override remains unchanged and is visibly marked as such. If a selected source is archived, preview explains its unavailable status and offers a route to remove the selection or restore the source. No stale canonical text is copied into override storage.

### Reset a Persona override

In Presentation, the user chooses “Use My Identity value”; the override row is removed, the latest canonical value is shown, and the change is recorded in the Persona revision history. Explicitly clearing a value is separate from reset.

## Accessibility and error states

- All ordering and include/exclude controls work without drag-only interaction; provide move up/down and accessible labels.
- Announce save, optimistic concurrency conflicts, archived source status and default changes to assistive technology.
- Preserve focus on validation errors and provide field-level constraints matching server validation.
- If another tab changed the Persona version, show the conflict and offer reload/reapply; never silently overwrite newer configuration.
- Network/auth failures retain no credentials or private data in client logs; unauthenticated users are redirected through existing auth flow.
