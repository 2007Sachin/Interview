/**
 * User-provided text ends up inside LLM prompts. We can't make injection
 * impossible, but we strip control characters, neutralize fence/markup
 * tricks, and clamp length so a hostile resume can't blow up the prompt.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeForPrompt(text: string, maxChars = 12000): string {
  return text
    .replace(CONTROL_CHARS, ' ')
    .replace(/```/g, "'''")
    .replace(/<\/?(system|assistant|user|instructions?)[^>]*>/gi, '')
    .replace(/[^\S\n]{3,}/g, '  ')
    .trim()
    .slice(0, maxChars);
}
