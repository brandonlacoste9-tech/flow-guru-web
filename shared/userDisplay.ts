/**
 * First name / short label for greetings — never uses developer placeholder names.
 * Falls back to email local-part when full name is unset (common with some OAuth flows).
 */
export type UserLikeForDisplay = {
  name?: string | null;
  email?: string | null;
} | null | undefined;

export function displayFirstName(user: UserLikeForDisplay): string {
  const trimmedName = user?.name?.trim();
  if (trimmedName) {
    const first = trimmedName.split(/\s+/)[0];
    if (first) return first;
  }
  const email = user?.email?.trim().toLowerCase();
  if (email?.includes("@")) {
    const local = email.split("@")[0] ?? "";
    const segment = local.split("+")[0] ?? "";
    const word = segment.replace(/[._-]/g, " ").trim().split(/\s+/).filter(Boolean)[0];
    if (word && /^[a-z0-9]/i.test(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  }
  return "";
}

/** Spoken lines (alarms) need a word when we don't know their name */
export function displayFirstNameOrNeutral(user: UserLikeForDisplay, neutralEn = "there"): string {
  return displayFirstName(user) || neutralEn;
}
