export const DB_LAYER: string;
export const APPROVED_CLIENT_MODULES: string[];
export const EXEMPT: { rule: string; file: string; reason: string }[];
export function stripComments(text: string): string;
export function scanSources(
  files: { path: string; text: string }[],
): { file: string; line: number; rule: string; message: string }[];
export function collectSources(
  root: string,
  dir?: string,
): { path: string; text: string }[];
export function formatViolation(v: {
  file: string;
  line: number;
  rule: string;
  message: string;
}): string;
