# Spec: Folio Designer (M14)

**Goal.** A platform admin ("Folio designer") controls which website and digital-card designs
exist. Designs can be generated from a prompt by AI, refined by hand, versioned, previewed,
published and retired without a deploy. Owners pick them in the existing design pickers.

## User stories

1. As a designer, I describe a design in words and get a draft I can preview with a sample person
   or my own profile.
2. As a designer, I adjust any value (layout, fonts, colours, radius…) by hand or ask the AI for a
   change, and every change is kept as a numbered version.
3. As a designer, I cannot publish a design whose text is not readable (WCAG AA).
4. As a designer, I publish a version, later make a newer version live, or retire the design.
5. As an owner, I see published designer designs next to the built-in ones, with the same Free /
   PRO rules, and my live site never changes until I republish.
6. As an owner using a retired design, I keep it and can still republish.

## Acceptance

- Only `platform_admins` can create or change designs (enforced by RLS, not only the app); there
  is no API to become an admin.
- AI output is a schema-validated JSON spec; no code, CSS or URL can be stored or rendered.
- Published snapshots pin `{ id, version, spec }`; the database refuses a pin that is not the
  design's current version, and refuses drafts, unknown designs, and PRO designs without PRO.
- Works with Gemini and any OpenAI-compatible gateway (FreeLLMAPI); without AI, hand editing works.
