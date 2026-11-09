# Design System

Folioone's approved direction is premium editorial meets a modern workspace: warm ivory surfaces, charcoal navigation, serif editorial headings, sans-serif body copy, restrained terracotta accents, subtle borders, spacious composition, and minimal icons. The workspace and eventual public portfolio should have distinct personalities while sharing tokens. Avoid purple gradients, neon, excessive glass, and generic rounded dashboard tiles.

Tailwind CSS 4 and shadcn/ui (New York conventions) are configured as the sole UI foundation. Design tokens live in `src/styles/globals.css`; shared primitives live in `src/components/ui`. Components currently cover buttons, input, textarea, select, dialog, dropdown menu, tabs, badge, avatar, and tooltip. Sidebar and workspace navigation primitives are composed in `src/components/workspace/workspace-shell.tsx`.

Semantic danger tokens (`--danger`, `--danger-soft`, with `destructive` and `destructive-outline` button variants) are reserved for errors and destructive actions. Accessible primitives added for the Persona screens: `Switch` (native checkbox with `role="switch"`), `LiveRegions`/`useAnnouncer` for screen-reader announcements, and `ConfirmDialog` built on the shared Dialog.

Use semantic HTML, visible keyboard focus, accessible names, and responsive behavior. Prefer restrained radii and color usage. Expand tokens and variants rather than introducing another UI framework.
