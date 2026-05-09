import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const ignoredDirs = new Set([
  '.git',
  '.vercel',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
]);

const textExtensions = new Set([
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
]);

const exactNames = new Set([
  '_redirects',
  '_headers',
  'vercel.json',
  'package.json',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
]);

function shouldProcess(filePath) {
  const name = path.basename(filePath);
  const ext = path.extname(name);
  return name.startsWith('.env') || exactNames.has(name) || textExtensions.has(ext);
}

function migrateContent(content) {
  return content.replaceAll('luniqfinancas.com', '2asfinancas.com');
}

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(absolutePath, files);
    } else if (entry.isFile() && shouldProcess(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files;
}

const files = await walk(repoRoot);
const changed = [];

for (const file of files) {
  const before = await readFile(file, 'utf8');
  const after = migrateContent(before);

  if (after !== before) {
    await writeFile(file, after);
    changed.push(path.relative(repoRoot, file));
  }
}

console.log(`Migracao concluida: ${changed.length} arquivo(s) atualizado(s).`);
for (const file of changed) {
  console.log(`- ${file}`);
}
