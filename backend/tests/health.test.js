const request = require('supertest');
const { app } = require('../server');

describe('Health Check API', () => {
  it('GET /health should return 200 OK and status JSON', async () => {
    const res = await request(app).get('/health');
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});
