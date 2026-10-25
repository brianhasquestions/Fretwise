// Copies the static web app into www/, the folder Capacitor packages into the Android app.
// The app has no build step of its own; this just keeps node_modules/ and android/ out of the bundle.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of ['index.html', 'styles.css', 'js']) {
  cpSync(join(root, item), join(out, item), { recursive: true });
}
console.log('Web app copied to www/');
