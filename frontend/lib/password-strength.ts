/**
 * Classic password strength scoring for UI only — no enforced policy.
 */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export type StrengthResult = {
  score: StrengthLevel;
  label: string;
  hint: string;
  /** 0–100 for progress bar */
  percent: number;
  /** Tailwind-ish colour tokens used by the meter */
  barClass: string;
  textClass: string;
};

export function scorePassword(password: string): StrengthResult {
  if (!password) {
    return {
      score: 0,
      label: "Enter a password",
      hint: "Any password is allowed — stronger is safer for this sensitive app.",
      percent: 0,
      barClass: "bg-muted",
      textClass: "text-muted-foreground",
    };
  }

  let score = 0;
  const len = password.length;
  if (len >= 6) score += 1;
  if (len >= 10) score += 1;
  if (len >= 14) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // Map raw points (0–6) to 0–4 classic levels
  let level: StrengthLevel = 0;
  if (score <= 1) level = 0;
  else if (score === 2) level = 1;
  else if (score === 3) level = 2;
  else if (score <= 5) level = 3;
  else level = 4;

  const table: Record<
    StrengthLevel,
    Omit<StrengthResult, "score" | "percent">
  > = {
    0: {
      label: "Super weak",
      hint: "Seriously? That weak?",
      barClass: "bg-red-500",
      textClass: "text-red-600 dark:text-red-400",
    },
    1: {
      label: "Weak",
      hint: "I'm sure you can do better than this!",
      barClass: "bg-orange-500",
      textClass: "text-orange-600 dark:text-orange-400",
    },
    2: {
      label: "Average",
      hint: "This is ok but still hackable.",
      barClass: "bg-amber-500",
      textClass: "text-amber-700 dark:text-amber-400",
    },
    3: {
      label: "Strong",
      hint: "This is a good password.",
      barClass: "bg-lime-500",
      textClass: "text-lime-700 dark:text-lime-400",
    },
    4: {
      label: "Supreme",
      hint: "Now this is a proper password, well done!",
      barClass: "bg-emerald-500",
      textClass: "text-emerald-700 dark:text-emerald-400",
    },
  };

  const t = table[level];
  return {
    score: level,
    percent: ((level + 1) / 5) * 100,
    ...t,
  };
}
