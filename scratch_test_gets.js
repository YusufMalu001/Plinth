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

    const paths = [
      '/api/v1/purchases/requisitions',
      '/api/v1/purchases/orders',
      '/api/v1/master-data/summary'
    ];

    paths.forEach(path => {
      const getReq = http.request({
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'GET',
        headers: { 'Cookie': cookieHeader }
      }, (res) => {
        let resData = '';
        res.on('data', chunk => resData += chunk);
        res.on('end', () => console.log(path, resData));
      });
      getReq.end();
    });
  });
});

loginReq.write(JSON.stringify({ email: 'admin@plinth.com', password: 'Admin123!' }));
loginReq.end();
