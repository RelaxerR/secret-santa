import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const endpoint = process.env.APPS_SCRIPT_URL || '';
if (endpoint && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) {
  throw new Error('APPS_SCRIPT_URL must be a deployed script.google.com /exec URL');
}
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('web', 'dist', { recursive: true });
await writeFile('dist/config.js', `export const config = Object.freeze(${JSON.stringify({ appsScriptUrl: endpoint })});\n`);
await writeFile('dist/.nojekyll', '');
console.log('Built dist/');
