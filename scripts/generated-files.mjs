// Put generated files back the way they were (ADR-0002 and ADR-0003).
// The release variants that scripts/gate-status.mjs runs rewrite the reports the pre-commit hook owns in another form, which
// left a modified tracked file behind after every dashboard run. snapshotFiles records the files that exist now and returns
// a function that restores them byte for byte and returns the paths it had to put back.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function snapshotFiles(root, rels) {
  const saved = rels.filter((rel) => existsSync(join(root, rel))).map((rel) => [rel, readFileSync(join(root, rel))]);
  return function restore() {
    const restored = [];
    for (const [rel, bytes] of saved) {
      const path = join(root, rel);
      if (existsSync(path) && readFileSync(path).equals(bytes)) continue;
      writeFileSync(path, bytes);
      restored.push(rel);
    }
    return restored;
  };
}
