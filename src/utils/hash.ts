const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DEFAULT_HASH_LENGTH = 7;

export function stableHash(input: string, length = DEFAULT_HASH_LENGTH): string {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return `h${hash.toString(36).padStart(DEFAULT_HASH_LENGTH, "0").slice(-length)}`;
}
