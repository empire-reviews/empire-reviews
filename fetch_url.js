import http from 'http';

const req = http.request({
    hostname: 'localhost',
    port: 59470,
    path: '/api/reviews',
    method: 'POST',
}, (res) => {
    console.log('Status:', res.statusCode);
});

req.on('error', (e) => console.error(e));
req.end();
