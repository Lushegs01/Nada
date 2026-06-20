import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export function createSeedPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

export function isValidSeedPhrase(seedPhrase: string): boolean {
  return validateMnemonic(seedPhrase.trim().toLowerCase(), wordlist);
}

export function seedPhraseToIdentitySeed(seedPhrase: string): Uint8Array {
  const normalized = seedPhrase.trim().toLowerCase();
  const seed = mnemonicToSeedSync(normalized);
  return seed.slice(0, 32);
}
