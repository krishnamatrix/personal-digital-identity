export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const VOICES = [
  {
    id: "en-US-JennyNeural",
    name: "Jenny",
    description: "English · US · warm",
    lang: "en-US",
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy",
    description: "English · US · grounded",
    lang: "en-US",
  },
  {
    id: "en-GB-SoniaNeural",
    name: "Sonia",
    description: "English · UK · clear",
    lang: "en-GB",
  },
] as const;
export const SAMPLE_SCRIPT =
  "Hi, I'm Jamie, a product designer who turns complex problems into simple, useful experiences. My work brings together research, thoughtful design, and close collaboration with engineering teams. I care about making products accessible and easy to use. Take a look around my portfolio to explore my work and the thinking behind it. If you're building something meaningful, I'd love to connect.";

export function validateImage(bytes: Uint8Array, type: string, size: number) {
  if (!size || size > MAX_PHOTO_BYTES)
    throw new Error("Choose a photo smaller than 2 MB.");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!((type === "image/png" && png) || (type === "image/jpeg" && jpeg)))
    throw new Error("Choose a valid JPEG or PNG photo.");
}
export function validateScript(script: string) {
  const clean = script.trim();
  const words = clean ? clean.split(/\s+/).length : 0;
  if (words < 10 || words > 140 || clean.length > 2000)
    throw new Error("Use 10–140 words and no more than 2,000 characters.");
  return { script: clean, words, seconds: Math.round((words / 140) * 60) };
}
/** Extractive draft, not an LLM: never adds claims to supplied résumé wording. */
export function draftFromResume(text: string) {
  if (text.length > 100_000 || text.includes("\u0000"))
    throw new Error("Use readable résumé text under 100 KB.");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•*#-]+/, "").trim())
    .filter(
      (l) =>
        l &&
        !/@|https?:|www\.|\+?\d[\d ()-]{7,}\d/.test(l) &&
        !/^(experience|education|skills|summary|resume|résumé|contact)$/i.test(
          l,
        ),
    );
  const words = lines.join(". ").split(/\s+/).filter(Boolean).slice(0, 100);
  if (words.length < 10)
    throw new Error("Add at least 10 words of readable résumé text.");
  return words.join(" ").slice(0, 1900);
}
