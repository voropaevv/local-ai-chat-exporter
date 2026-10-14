import { zipSync } from "fflate";

/**
 * ZIP stores a timezone-free DOS timestamp. Construct midnight in the current
 * timezone so every host writes the same fields instead of converting one UTC
 * instant to a different local clock time.
 */
export function createDeterministicZip(files) {
  const entryDate = new Date(1980, 0, 1, 0, 0, 0, 0);
  const entries = {};

  for (const name of Object.keys(files).sort()) {
    entries[name] = [files[name], { mtime: entryDate }];
  }

  return zipSync(entries, { level: 9 });
}
