import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { authorize } from '../../common/middleware/authorize';
import { DbPermissionChecker } from '../../common/rbac/db-permission-checker';
import { DashboardService, DashboardTimeframe } from './dashboard.service';

const router = Router();
const service = new DashboardService();
const permissionChecker = new DbPermissionChecker();

router.use(authenticate);
router.get('/dashboard/overview', authorize('read', 'Dashboard', permissionChecker), async (req, res, next) => {
  try {
    const timeframe = String(req.query.timeframe ?? 'month');
    const normalized: DashboardTimeframe = timeframe === 'quarter' || timeframe === 'year' ? timeframe : 'month';
    const result = await service.getOverview(req.user!.id, normalized);
    res.status(200).json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
});

export default router;
