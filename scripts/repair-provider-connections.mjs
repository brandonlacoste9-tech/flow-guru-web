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
  multipleStatements: true,
});

await connection.beginTransaction();

try {
  await connection.query(`
    DELETE pc1
    FROM providerConnections pc1
    INNER JOIN providerConnections pc2
      ON pc1.userId = pc2.userId
      AND pc1.provider = pc2.provider
      AND (
        pc1.updatedAt < pc2.updatedAt
        OR (pc1.updatedAt = pc2.updatedAt AND pc1.id < pc2.id)
      )
  `);

  const [existingIndexes] = await connection.query(`
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'providerConnections'
      AND INDEX_NAME = 'providerConnections_user_provider_unique_idx'
  `);

  if (Array.isArray(existingIndexes) && existingIndexes.length === 0) {
    await connection.query(`
      ALTER TABLE providerConnections
      ADD CONSTRAINT providerConnections_user_provider_unique_idx UNIQUE (userId, provider)
    `);
  }

  await connection.commit();

  const [rows] = await connection.query(`
    SELECT id, userId, provider, status, externalAccountLabel, lastError, createdAt, updatedAt
    FROM providerConnections
    ORDER BY userId, provider, updatedAt DESC, id DESC
  `);

  console.log(JSON.stringify({ repaired: true, rows }, null, 2));
} catch (error) {
  await connection.rollback();
  console.error(error);
  process.exit(1);
} finally {
  await connection.end();
}
