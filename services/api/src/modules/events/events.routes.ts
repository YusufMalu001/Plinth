import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth';
import { subscribe } from '../../common/realtime/event-bus';

const router = Router();
router.get('/stream', authenticate, (req, res) => {
  const actorId = req.user?.id || 'system';
  res.status(200); res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.setHeader('X-Accel-Buffering', 'no');
  res.write(`retry: 5000\n\nevent: connected\ndata: ${JSON.stringify({ actorId })}\n\n`);
  const unsubscribe = subscribe(actorId, res); const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});
export default router;
