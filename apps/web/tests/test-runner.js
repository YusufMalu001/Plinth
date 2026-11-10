const { request } = require('@playwright/test');

async function run() {
  const apiContext = await request.newContext({
    baseURL: 'http://localhost:5000'
  });

  const loginRes = await apiContext.post('/api/v1/auth/login', {
    data: { email: 'admin@synergy.com', password: 'admin' }
  });
  
  if (!loginRes.ok()) {
    console.error('Login failed', await loginRes.json());
    process.exit(1);
  }
}
run();
