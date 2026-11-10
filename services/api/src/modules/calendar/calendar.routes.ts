import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { CalendarController } from './calendar.controller';

const router = Router();
const controller = new CalendarController();

router.use(authenticate);

router.get('/calendar/day', controller.getDaySummary);
router.get('/calendar/month', controller.getMonthOverview);

export default router;
