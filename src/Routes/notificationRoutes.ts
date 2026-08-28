import { Router } from 'express';
import * as NotificationController from '../Controllers/NotificationController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

router.get('/',                    NotificationController.getNotifications);
router.get('/unread-count',        NotificationController.getUnreadCount);
router.put('/mark-all-read',       NotificationController.markAllRead);
router.put('/:id/read',            NotificationController.markRead);
router.post('/fcm-token',          NotificationController.saveFcmToken);

export default router;
