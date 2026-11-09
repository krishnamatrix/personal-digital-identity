export const SCHEMA: string;
export function generate(options?: { verbose?: boolean }): Map<string, string>;
export function retarget(file: string, text: string): string;
