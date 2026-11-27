import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(file);
    else if (file.endsWith('.gs')) new vm.Script(await readFile(file, 'utf8'), { filename: file });
    else if (/\.(m?js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${file}`);
    } else if (file.endsWith('.json')) JSON.parse(await readFile(file, 'utf8'));
  }
}
for (const path of ['web', 'backend', 'scripts', 'tests']) await walk(path);
console.log('JavaScript, Apps Script and JSON syntax OK');
