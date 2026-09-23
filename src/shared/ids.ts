const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Works on plain-http pages too, where `crypto.randomUUID` is unavailable. */
export function randomId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
