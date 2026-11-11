import { execSync } from 'child_process';

function query(sql) {
  const cmd = `docker exec plinth-postgres psql -U postgres -d plinth_erp -t -A -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

console.log('Postgres version:', query('SELECT version();'));
console.log('Users count:', query('SELECT count(*) FROM users;'));
