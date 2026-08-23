const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Time-ordered unique id.
 *
 * The leading timestamp makes ids sort chronologically, which keeps exported
 * backups readable and gives stable ordering for readings recorded in the same
 * millisecond. `expo-crypto` would give stronger randomness, but these ids never
 * leave the device and never act as a secret — collision resistance across one
 * person's readings is all that is required.
 */
export function newId(): string {
  let time = Date.now();
  let stamp = '';
  for (let i = 0; i < 9; i++) {
    stamp = ALPHABET[time % 36] + stamp;
    time = Math.floor(time / 36);
  }

  let random = '';
  for (let i = 0; i < 10; i++) {
    random += ALPHABET[Math.floor(Math.random() * 36)];
  }
  return `${stamp}${random}`;
}
