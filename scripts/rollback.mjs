// Rollback script to revert to the version prior to the recent feature additions.
import { copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const filesToRestore = [
  ["backups/pre-features/src/App.jsx", "src/App.jsx"],
  ["backups/pre-features/src/components/GuessHistory.jsx", "src/components/GuessHistory.jsx"],
  ["backups/pre-features/src/components/MovieSearch.jsx", "src/components/MovieSearch.jsx"],
  ["backups/pre-features/src/index.css", "src/index.css"],
  ["backups/pre-features/vite.config.js", "vite.config.js"],
];

const filesToRemove = [
  "src/lib/tmdb.js",
  "src/components/MovieListModal.jsx",
];

async function rollback() {
  console.log("Reverting project to previous version...");
  for (const [src, dest] of filesToRestore) {
    if (existsSync(src)) {
      await copyFile(src, dest);
      console.log(`  Restored: ${dest}`);
    }
  }
  for (const f of filesToRemove) {
    if (existsSync(f)) {
      await rm(f, { force: true });
      console.log(`  Removed added file: ${f}`);
    }
  }
  console.log("\nDone! The project has been restored to the previous version.");
}

rollback().catch((err) => {
  console.error("Rollback failed:", err);
  process.exit(1);
});

