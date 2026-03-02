const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/products',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('\n=== Response Body ===');
    if (res.headers['content-type']?.includes('json')) {
      try {
        console.log(JSON.stringify(JSON.parse(data), null, 2));
      } catch (e) {
        console.log(data);
      }
    } else {
      console.log(data.substring(0, 500));
    }
  });
});

req.on('error', err => console.error('Error:', err));
req.end();
