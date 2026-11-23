# Interface Contracts: `llms.txt` Endpoints & Discovery

**Feature**: `004-llms-txt` | **Date**: 2026-11-20

## 1. `GET /llms.txt` (Platform Summary)

- **Auth**: Anonymous / public (no cookies or session required).
- **Response (200 OK)**:
  - `Content-Type`: `text/markdown; charset=utf-8`
  - `Cache-Control`: `public, max-age=300, stale-while-revalidate=3600`
  - **Body structure**:

    ```markdown
    # Folioone

    > Personal digital identity workspace: maintain one canonical private profile and publish curated personal websites, articles, and digital cards.

    ## Public Pages

    - [Home](<origin>/): Overview of Folioone and how personal digital identity publishing works.
    - [Pricing](<origin>/pricing): Free and PRO plan details.

    ## Published Websites

    Each explicitly published Folioone personal website provides its own machine-readable summary at `<origin>/<slug>/llms.txt`.
    ```

- **Privacy invariants**: Contains zero user-specific data, zero account identifiers, and zero enumeration of user slugs or private workspace routes (`/profile`, `/website`, `/articles`, `/personas`, `/cards`, `/insights`).

## 2. `GET /<slug>/llms.txt` (Published Personal Website Summary)

- **Auth**: Anonymous / public. Reads only active published website snapshots (`getPublicSite`) and live published article snapshots (`getPublicArticles`).
- **Response (200 OK — live published website)**:
  - `Content-Type`: `text/markdown; charset=utf-8`
  - `Cache-Control`: `no-store`
  - **Body structure** (empty sections omitted; order matches published snapshot `sections`):

    ```markdown
    # <Person Name>

    > <Concise summary: headline / role / location / shortBio>

    - [Website](<origin>/<slug>): <site.title>
    - [Links](<origin>/<slug>/links): Active links page _(only if links page is enabled)_

    ## <About heading>

    ...

    ## <Featured heading>

    - [<Title>](url): <platformLabel> (<mediaType>, <date>) — <summary>

    ## <Experience heading>

    - **<Title>**, <Organization> (<start> – <end|Present>, <location>): <description>

    ## <Education heading>

    - **<Institution>** — <qualification> (<specialization>, <start> – <end>): <description>

    ## <Skills heading>

    - **<Category>**: Skill A, Skill B

    ## <Projects heading>

    - [<Name>](url) _(or **<Name>** if no URL)_ — <role>: <description> (Technologies: ...)

    ## <Articles heading>

    - [<Title>](<origin>/<slug>/articles/<articleSlug>): <excerpt> (<readingMinutes> min read)

    ## <Achievements heading>

    - **<Title>** (<date>): <description>

    ## <Certifications heading>

    - [<Name>](url) _(or **<Name>**)_ — <issuer> (<date>)

    ## <Social heading>

    - [<Label>](url)

    ## <Booking heading>

    - [<Title>](url): <providerLabel> — <description>

    ## <Contact heading>

    - Email: <email> _(only if opted in)_
    - Phone: <phone> _(only if opted in)_
    - Website: [<website>](website) _(only if opted in)_
    ```

- **Response (404 Not Found — unknown, malformed, reserved, never-published, or unpublished slug)**:
  - `Content-Type`: `text/plain; charset=utf-8`
  - `Cache-Control`: `no-store`
  - `X-Robots-Tag`: `noindex`
  - Body: `Not Found\n`
- **Response (503 Service Unavailable — unexpected snapshot read failure)**:
  - `Content-Type`: `text/plain; charset=utf-8`
  - `Cache-Control`: `no-store`
  - `X-Robots-Tag`: `noindex`
  - Body: `Service Unavailable\n`
- **Size bound**: Always `< 100 KB` UTF-8 bytes.

## 3. HTML Discovery Metadata

- **Platform landing page (`/`)**:
  - Emits `<link rel="alternate" type="text/markdown" href="/llms.txt" />` via `metadata.alternates.types`.
- **Live published website (`/<slug>`)**:
  - Emits `<link rel="alternate" type="text/markdown" href="<origin>/<slug>/llms.txt" />` via `generateMetadata` `alternates.types`.
- **Non-public / 404 pages**:
  - Unpublished or unknown `/<slug>` returns `{ title: "Page not found", robots: { index: false } }` with no `alternates.types`.
  - Private workspace routes (`/profile`, `/website`, `/website/preview`, `/articles`, `/personas`, `/cards`, `/insights`) emit no `llms.txt` discovery link.
