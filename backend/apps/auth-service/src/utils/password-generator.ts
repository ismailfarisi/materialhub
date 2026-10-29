import { randomInt } from "node:crypto";

const LOWER = "abcdefghjkmnpqrstuvwxyz"; // exclude i, l, o
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ"; // exclude I, L, O
const DIGIT = "23456789"; // exclude 0, 1
const SYMBOL = "!@#$%^&*-_=+?";
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function pick(charset: string): string {
  return charset[randomInt(0, charset.length)]!;
}

export function generateTemporaryPassword(length = 16): string {
  if (length < 4) {
    throw new Error("Password length must be >= 4 to satisfy class requirements");
  }

  // Guarantee one of each class
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  const remaining: string[] = [];
  for (let i = 0; i < length - 4; i++) {
    remaining.push(pick(ALL));
  }

  // Fisher–Yates shuffle of [...required, ...remaining] using crypto-safe randomness
  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
