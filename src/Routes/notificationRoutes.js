"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const NotificationController = require("../Controllers/NotificationController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateToken);
router.get('/', NotificationController.getNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.put('/mark-all-read', NotificationController.markAllRead);
router.put('/:id/read', NotificationController.markRead);
router.post('/fcm-token', NotificationController.saveFcmToken);
exports.default = router;
//# sourceMappingURL=notificationRoutes.js.map