import { loadContent } from '../lib/content.ts';
const catalog = loadContent();
console.log(`${catalog.entries.length} published entries`);
for (const issue of catalog.issues) console.error(`${issue.file}: ${issue.message}`);
if (catalog.issues.length) process.exitCode = process.argv.includes('--warn-only') ? 0 : 1;
else console.log('Content validation passed. Templates and drafts are excluded.');
