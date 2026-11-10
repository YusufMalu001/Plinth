import { describe, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import * as db from '../../database';

// Mock the database connection check
jest.mock('../../database', () => ({
  testDbConnection: jest.fn()
}));

describe('GET /api/v1/health', () => {
  it('should return 200 and healthy status when database is connected', async () => {
    (db.testDbConnection as jest.Mock<any>).mockResolvedValue({
      connected: true,
      latencyMs: 12
    });

    const response = await request(app)
      .get('/api/v1/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        service: 'synergy-api',
        status: 'healthy',
        database: expect.objectContaining({
          connected: true,
          latencyMs: 12
        })
      })
    );
  });

  it('should return 503 and unhealthy status when database is disconnected', async () => {
    (db.testDbConnection as jest.Mock<any>).mockResolvedValue({
      connected: false
    });

    const response = await request(app)
      .get('/api/v1/health')
      .expect('Content-Type', /json/)
      .expect(503);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        service: 'synergy-api',
        status: 'unhealthy',
        database: expect.objectContaining({
          connected: false
        })
      })
    );
  });
});
