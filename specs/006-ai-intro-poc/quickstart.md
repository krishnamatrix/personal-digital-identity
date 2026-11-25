# AI intro studio POC

Start Folioone with `pnpm dev`, then visit [the studio](http://localhost:3000/poc/video-studio).

The POC uses Folioone's Next.js App Router, TypeScript, Tailwind tokens, shadcn-style shared Button and Zod stack. No new dependencies or database changes.

## Try the free local demo

1. Upload a JPEG/PNG portrait under 2 MB (at least 128 × 128).
2. Edit the sample script, or paste/upload a UTF-8 TXT/Markdown résumé under 100 KB and choose Prepare draft. Drafting is extractive, without LLM calls; rewrite copied résumé wording into a spoken introduction. PDF/DOCX are excluded.
3. Select a voice and optionally preview your device's stock voice. Browser/OS speech services may process preview text; this voice differs from the provider voice.
4. Approve the script and photo permissions, then Create demo video.
5. Play/download the six-second silent WebM motion portrait. It uses script excerpts and does not have lip sync or an embedded soundtrack. Chrome/Edge with Canvas captureStream and MediaRecorder are recommended. Browser rendering/playback remains unverified until manually tried.

All local inputs and output blobs live only in the page's memory. Reset clears them; edits invalidate output and approval. No automatic portfolio publication or Master Identity changes.

## Optional real talking-avatar mode

Configure these server environment variables securely, then restart Next.js:

```dotenv
VIDEO_POC_LIVE_ENABLED=true
DID_API_KEY=your_d_id_basic_authorization_credential
```

`DID_API_KEY` is the value following `Basic ` in your provider's Authorization header, without the `Basic ` prefix. Never use a NEXT_PUBLIC variable or commit credentials. No existing environment file was read or edited for this feature.

Sign in to Folioone through its existing Auth flow. Select Live avatar, approve provider processing and potential charges, then generate. The server authenticates before uploading your portrait to D-ID, submits the approved script/voice, and checks status for up to approximately two minutes plus request timeouts. Check status resumes polling without another generation submission. Do not assume a timeout means no charge: inspect the provider dashboard before a fresh submission. A failed submission retains its request ID for safe same-process retry.

Live mode uses [D-ID image upload](https://docs.d-id.com/reference/upload-an-image) and [photo-avatar generation](https://docs.d-id.com/docs/v2-photo-avatar-quickstart). Provider billing, availability, retention and deletion terms apply. No live provider request was made during implementation. Current voice IDs, account access, charges and output quality require a controlled live check.

## POC limitations

- One Node process only. At most three submissions per owner per hour, 100 process-wide retained jobs, four-second minimum status fetch spacing, one-hour job lifetime. Limits are transient, not production spend controls.
- Restart/refresh loses some or all recovery state; jobs are not persisted in Supabase. Unknown job lookups never call the provider. No administrative database credentials or SQL.
- Live videos remain at the provider and use expiring bearer URLs. They are not authenticated Folioone Storage assets. Open/save promptly. Reset does not cancel provider generation or delete provider copies.
- No captions, clone training, payments, unattended workers or portfolio publishing.
- Production integration needs an AD-014 amendment, durable owner-scoped reservations, verified quotas/billing, private media ingestion and validation, source deletion, captions, publication derivatives and revocation.

## Verification

See [tasks.md](tasks.md) for actual commands and outcomes. Unit mocks establish application behavior, not live provider quality or hosted isolation. Browser and hosted suites were not run.
