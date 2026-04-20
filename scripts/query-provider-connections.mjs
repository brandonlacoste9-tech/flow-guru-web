import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const url = new URL(databaseUrl);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  ssl: url.searchParams.get('ssl') === 'false' ? undefined : { rejectUnauthorized: false },
});

const [rows] = await connection.query(`
  SELECT id, userId, provider, status, externalAccountLabel, scope, tokenType, expiresAtUnixMs, lastError, createdAt, updatedAt
  FROM providerConnections
  ORDER BY userId, provider, updatedAt DESC, id DESC
`);

console.log(JSON.stringify(rows, null, 2));
await connection.end();
