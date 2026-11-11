import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:55432/plinth_erp'
});
await client.connect();
const res = await client.query('SELECT count(*) FROM users');
console.log('User count:', res.rows[0].count);
await client.end();
