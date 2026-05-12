/**
 * @fileoverview Tests for Profile Controller.
 */

const { getLeaderboard } = require('../controllers/profile.controller');
const { User } = require('../models');

jest.mock('../models');
jest.mock('../config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn(),
  del: jest.fn()
}));

describe('Profile Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('getLeaderboard', () => {
    it('should return leaderboard successfully', async () => {
      const mockUsers = [{ username: 'testuser', eloRating: 1200, wins: 10, losses: 5, totalDebates: 15 }];
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockUsers)
      });

      await getLeaderboard(req, res);

      expect(User.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ leaderboard: expect.any(Array), cached: false });
    });

    it('should return 500 if DB fails', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockRejectedValue(new Error('DB error'))
      });

      await getLeaderboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
