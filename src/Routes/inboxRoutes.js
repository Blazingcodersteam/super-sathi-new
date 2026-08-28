"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const InboxController = require("../Controllers/InboxController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Apply authentication middleware to all routes
router.use(auth_1.authenticateToken);
// Inbox Summary - Get counts for all tabs
router.get('/summary', InboxController.getInboxSummary);
// Matches Tab - Opposite gender profiles not yet connected
router.get('/matches', InboxController.getMatchesForInbox);
// Received Tab - Interest requests received from others
router.get('/received', InboxController.getReceivedInterests);
// Accepted Tab - Accepted connections (both directions)
router.get('/accepted', InboxController.getAcceptedConnections);
// Requests Tab - All types of requests (pending, accepted, sent)
router.get('/requests', InboxController.getRequests);
// Sent Tab - Interest requests sent by user
router.get('/sent', InboxController.getSentInterests);
// Deleted Tab - Declined/deleted interests
router.get('/deleted', InboxController.getDeletedInterests);
// Inbox Actions - Use POST to differentiate from general match actions
router.post('/accept-interest', InboxController.acceptInterestFromInbox);
router.post('/decline-interest', InboxController.declineInterestFromInbox);
router.post('/photo-request', InboxController.sendPhotoRequest);
router.delete('/photo-request', InboxController.cancelPhotoRequest);
router.post('/cancel', InboxController.cancelInvitation);
router.post('/remind', InboxController.sendReminder);
router.get('/reminders', InboxController.getReminders);
router.get('/cancelled', InboxController.getCancelledInvitations);
exports.default = router;
//# sourceMappingURL=inboxRoutes.js.map