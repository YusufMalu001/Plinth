const http = require('http');

const loginReq = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const cookies = res.headers['set-cookie'] || [];
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    console.log('Login Response:', data);

    const patchReq = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/auth/me',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      }
    }, (patchRes) => {
      let patchData = '';
      patchRes.on('data', chunk => patchData += chunk);
      patchRes.on('end', () => {
        console.log('PATCH Response:', patchData);
      });
    });
    patchReq.write(JSON.stringify({ firstName: 'Test' }));
    patchReq.end();
  });
});

// Assuming a default user exists, e.g. admin@synergy.com
loginReq.write(JSON.stringify({ email: 'admin@synergy.com', password: 'Admin123!' }));
loginReq.end();
