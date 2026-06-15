// Add a task to the Notion 🎯 Daily Tasks database.
// Reads NOTION_API_KEY from ~/.hermes/.env or process.env.
// Usage: node add-notion-task.js "add pwa to home page as app"

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

const DATABASE_ID = '361f4a3a-1b1d-812f-91a3-fed124663650';
const NOTION_VERSION = '2025-09-03';

function loadEnv() {
  try {
    const envPath = resolve(homedir(), '.hermes/.env');
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^NOTION_API_KEY=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {
    // fall through
  }
  return process.env.NOTION_API_KEY;
}

const token = loadEnv();
if (!token) {
  console.error('No NOTION_API_KEY found in ~/.hermes/.env or environment.');
  process.exit(1);
}

const title = process.argv[2] || 'add pwa to home page as app';

async function notion(path, opts) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Notion ${opts.method || 'GET'} ${path} failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  // 1. Inspect database to find the title property, Status, and first data source.
  const db = await notion(`/databases/${DATABASE_ID}`, { method: 'GET' });
  const titleProp = Object.entries(db.properties).find(([, v]) => v.type === 'title');
  if (!titleProp) {
    throw new Error('Database has no title property');
  }
  const titleName = titleProp[0];
  const hasStatus = Object.values(db.properties).some((v) => v.type === 'select' && /status/i.test(v.name));

  const dataSources = db.data_sources || [];
  const dataSourceId = dataSources[0]?.id || db.id || DATABASE_ID;
  if (!dataSources[0]) {
    console.warn('No data_sources found; falling back to database id as data_source_id.');
  }

  // 2. Create the page. Use data_source_id per v2025-09-03 guidance.
  const properties = {
    [titleName]: { title: [{ text: { content: title } }] },
  };
  if (hasStatus) {
    properties.Status = { select: { name: 'Not started' } };
  }

  const page = await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: {
        type: 'database_id',
        data_source_id: dataSourceId,
      },
      properties,
    }),
  });

  console.log('Created Notion task:', page.url);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
