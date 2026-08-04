/**
 * Calm lines shown on the boot splash while the local engine starts.
 * Cycle randomly — short, non-salesy, easy to read while waiting.
 */
export const SPLASH_QUOTES: string[] = [
  "Clarity is a kind of wealth.",
  "Small numbers, tended daily, become freedom.",
  "You don’t need more noise — you need a clear ledger.",
  "Order is not control. It is calm.",
  "Your money has a story. Make it readable.",
  "One quiet step at a time is still progress.",
  "Privacy is a feature, not a luxury.",
  "What you measure gently, you can improve gently.",
  "Today’s books are tomorrow’s peace of mind.",
  "Local data. Your rules. Your pace.",
  "Chaos lives in the unknown. Light lives in the list.",
  "A steady system beats a perfect plan.",
  "Breathe. Balance follows attention.",
  "The world can be loud. Your finances don’t have to be.",
  "Begin simply. Depth comes later.",
];

export function pickSplashQuote(exclude?: string): string {
  if (SPLASH_QUOTES.length === 0) return "";
  if (SPLASH_QUOTES.length === 1) return SPLASH_QUOTES[0];
  let next = SPLASH_QUOTES[Math.floor(Math.random() * SPLASH_QUOTES.length)];
  let guard = 0;
  while (exclude && next === exclude && guard < 8) {
    next = SPLASH_QUOTES[Math.floor(Math.random() * SPLASH_QUOTES.length)];
    guard += 1;
  }
  return next;
}
