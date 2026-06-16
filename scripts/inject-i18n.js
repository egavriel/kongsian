import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const PAGES_DIR = resolve(__dirname, '../apps/web/src/pages');

function walkDir(dir, callback) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (stat.isFile() && file.endsWith('.astro')) {
      callback(filePath);
    }
  }
}

let modifiedCount = 0;
let skippedCount = 0;

walkDir(PAGES_DIR, (filePath) => {
  const content = readFileSync(filePath, 'utf8');
  
  // Check if already contains the script tag
  if (content.includes('/i18n-helper.js')) {
    skippedCount++;
    console.log(`[SKIP] Already localized: ${filePath}`);
    return;
  }
  
  // Locate the <head> tag
  if (content.includes('<head>')) {
    const updated = content.replace('<head>', '<head>\n    <script src="/i18n-helper.js" is:inline></script>');
    writeFileSync(filePath, updated, 'utf8');
    modifiedCount++;
    console.log(`[OK] Injected i18n into: ${filePath}`);
  } else {
    console.log(`[WARN] No <head> tag found in: ${filePath}`);
  }
});

console.log(`\n--- Completed. Injected: ${modifiedCount}, Skipped: ${skippedCount} ---`);
