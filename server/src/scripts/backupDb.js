require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

function parseDatabaseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

/** Runs pg_dump against DATABASE_URL and writes a timestamped .sql file to server/backups/ (gitignored). */
async function backupDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const { host, port, user, password, database } = parseDatabaseUrl(process.env.DATABASE_URL);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(BACKUP_DIR, `stocksense_${timestamp}.sql`);

  const pgDumpPath = process.env.PG_DUMP_PATH || 'pg_dump';
  const args = ['-h', host, '-p', port, '-U', user, '-d', database, '-F', 'p', '-f', outFile];

  await new Promise((resolve, reject) => {
    execFile(pgDumpPath, args, { env: { ...process.env, PGPASSWORD: password } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`pg_dump failed: ${stderr || err.message}`));
      resolve();
    });
  });

  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`Backup written: ${outFile} (${sizeKb} KB)`);
  return { file: outFile, sizeKb: Number(sizeKb) };
}

module.exports = { backupDb };

if (require.main === module) {
  backupDb().catch((e) => { console.error(e); process.exit(1); });
}
