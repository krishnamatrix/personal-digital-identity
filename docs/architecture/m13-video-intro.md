# M13: Video intro

People record a short self-introduction on Folioone, reading their script from a teleprompter. Visitors tap the hero
photo on the person's website (or their links page) to watch it.

## What the owner sees

**My Website → Video Intro** (`/website/intro`, in the sidebar as "Video Intro"):

1. **Script.** A textarea with a word count and the reading time at 140 words per minute.
   - "Draft from my profile" writes a 30, 60 or 90 second script in one of three tones from the owner's profile facts.
     It uses Gemini when `GEMINI_API_KEY` is set and a plain template otherwise.
   - The prompt tells the model to use only the given facts and never invent employers, titles or numbers.
   - The script is saved when the field loses focus and when the owner moves on to recording.
2. **Record.** A camera preview, mirrored as people expect (the recording itself is not mirrored). On phones the stage is
   portrait with smaller text.
   - **Teleprompter:** a band at the top of the preview, close to the lens. It scrolls at Slow / Normal / Fast (110 / 140
     / 170 wpm) and has a text-size control. Space pauses it, and "Practice" scrolls it without recording.
   - **Recording:** starts after a 3-2-1 countdown, with a microphone level meter, and stops by itself at 2:00.
   - **Devices:** camera and microphone pickers appear when there is more than one of either.
3. **Review.** Play the take back, pick a cover frame ("Use current frame as cover"), then "Record again" or "Use this
   take".
   - Saving shows its progress in three steps: upload, check, captions.

The **Your intro** panel shows the saved take, a "Show on my website" switch, the captions (editable wording) and Delete.

## Storage and data

| Where                                    | What                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `identity-video` (private bucket)        | `<uid>/intro/<video_id>.<webm\|mp4>` and `<video_id>.jpg` (cover)                   |
| `public-video` (public bucket)           | `<uid>/website/<video_id>.<ext>`: copies made only on publish                       |
| `folioone.intro_videos` (owner-only RLS) | script, the take (id, type, size, duration, poster flag), captions, show_on_website |

- Storage paths are derived from `account_id + video_id + content_type`; no path is stored.
- Both buckets are limited to 50 MB per object, WebM / MP4 / JPEG only.
- The recorder prefers H.264/AAC MP4 when the browser can record it, so the video plays everywhere. Otherwise it records
  WebM at about 2 Mbit/s, which is about 30 MB for two minutes.

## Saving a take (AD-014)

1. `beginUploadAction`: validates the type, size and duration, then creates signed upload URLs for the video and the
   cover with the owner's session. Nothing is recorded yet.
2. The browser PUTs the files straight to Storage, with progress shown.
3. `completeUploadAction`:
   - checks that the object exists, its size and its first bytes (EBML for WebM, `ftyp` for MP4, `FFD8FF` for the
     cover); a mismatch deletes the upload;
   - points the row at the new take;
   - deletes older private takes.
4. Captions (optional, needs Gemini). The browser decodes the soundtrack, resamples it to a 16 kHz mono WAV (about 32
   KB/s) and sends it to `captionAction`. Gemini returns timed cues; `cleanCaptions` bounds, sorts and de-overlaps them.
   - The video itself is never sent to an AI provider.
   - A captions failure never blocks saving.

## On the website

- `buildPublishedContent` puts `person.intro` (`videoUrl`, `posterUrl`, `type`, `duration`, `captions`) into the
  snapshot when there is a take and "Show on my website" is on.
- URLs are the deterministic public copies, so the "unpublished changes" check stays stable.
- `publishWebsite` copies the take before publishing and removes stale public copies afterwards; `unpublishWebsite`
  removes all of them.
- The owner's preview uses signed private URLs.
- **The talking photo** (`WithIntro` / `IntroTrigger`): every design's hero portrait becomes a button with a "Watch
  intro · 0:47" pill. Small avatars get a play dot; this covers the minimal design and the links page, which also says
  "Tap my photo to watch my intro".
- **Loading:** nothing about the video loads until the visitor taps.
- **The dialog:** plays with sound and has captions on by default (a WebVTT `blob:` track built in the browser, with cue
  text escaped) and a "Read transcript" toggle.
- **WebM length:** browser WebM recordings have no stored duration, so `useSeekableDuration` seeks past the end once to
  make the seek bar work.

## Insights

- Tapping the photo records `video_play` with kind `intro`.
- Playing to the end records the new `video_complete` event, through `trackInsight()` and the page's `PageTracker`.
- The "Video plays" tile shows "Your intro: N · X% to the end".

## SQL (developer runs these; not executed by the app)

- `docs/sql/milestone-13/001-intro-video-storage.sql`: the two buckets and six owner-only Storage policies. Not part of
  `pnpm validate`, because Storage is off locally.
- `docs/sql/milestone-13/002-intro-videos.sql`: the `intro_videos` table (forced RLS, four owner policies, no anon
  access) and `video_complete` in the insight event check. Part of `pnpm validate`.

Until both are run:

- The studio page shows its error message.
- Websites keep working. `loadIntroRow` logs the missing table and carries on without the intro.

## Limits and follow-ups

- **One intro per person;** a new take replaces the old one.
- **Deleting:** a live website keeps its published copy until the owner publishes again, as profile photos do.
- **Uploads:** only recordings made in the studio, no file upload yet. Adding one only needs a file picker in front of
  the same upload flow, but it would have no separate soundtrack, so captions would need the video's own audio decoded.
- **Egress:** every play is a Storage download. If intros get popular, move public playback to a streaming CDN.
- **Digital cards:** not shown there yet.
