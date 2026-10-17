export const inviteTokenPattern = /^[a-f0-9]{64}$/i;
export function invitationToken(input: string) {
  const text = input.trim();
  if (inviteTokenPattern.test(text)) return text.toLowerCase();
  try {
    const url = new URL(text);
    const token = new URLSearchParams(url.hash.slice(1)).get(
      "caregiver-invite",
    );
    if (token && inviteTokenPattern.test(token)) return token.toLowerCase();
  } catch {}
  throw Error("Paste the complete invite link or 64-character invite code.");
}
export function invitationEmail(input: unknown) {
  if (typeof input !== "string") throw Error("Enter the caregiver’s email.");
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Enter a valid email address.");
  return email;
}
