import { Router } from "express";
import * as matchActionsController from "../Controllers/MatchActionsController";

import { authenticateToken } from "../middleware/auth";

const router = Router();

// Match Actions routes
router.post("/send-interest", authenticateToken, matchActionsController.sendInterest);
router.put("/accept-interest", authenticateToken, matchActionsController.acceptInterest);
router.put("/decline-interest", authenticateToken, matchActionsController.declineInterest);
router.post("/shortlist", authenticateToken, matchActionsController.addToShortlist);
router.delete("/shortlist/:id", authenticateToken, matchActionsController.removeFromShortlist);
router.post("/block", authenticateToken, matchActionsController.blockProfile);
router.delete("/block/:id", authenticateToken, matchActionsController.unblockUser);
router.post("/dont-show-again", authenticateToken, matchActionsController.dontShowAgain);
router.get("/report-reasons", authenticateToken, matchActionsController.getReportReasons);
router.post("/report", authenticateToken, matchActionsController.reportProfile);
router.get("/interests/sent", authenticateToken, matchActionsController.getInterestsSent);
router.get("/interests/received", authenticateToken, matchActionsController.getInterestsReceived);
router.get("/shortlist", authenticateToken, matchActionsController.getShortlistedProfiles);
router.get("/blocked", authenticateToken, matchActionsController.getBlockedUsers);
router.get("/recently-viewed", authenticateToken, matchActionsController.getRecentlyViewedMembers);
router.get("/who-viewed-me", authenticateToken, matchActionsController.getWhoViewedMyProfile);
router.get("/ignored", authenticateToken, matchActionsController.getIgnoredMembers);
router.delete("/ignored/:targetUserId", authenticateToken, matchActionsController.removeFromIgnored);
router.post("/connect-now", authenticateToken, matchActionsController.connectNow);
router.put("/connect-now/accept", authenticateToken, matchActionsController.acceptConnectRequest);
router.put("/connect-now/decline", authenticateToken, matchActionsController.declineConnectRequest);
router.delete("/connect-now/cancel", authenticateToken, matchActionsController.cancelConnectRequest);
router.get("/connect-requests", authenticateToken, matchActionsController.getConnectRequests);
router.get("/connection-status/:target_user_id", authenticateToken, matchActionsController.getConnectionStatus);
router.get("/my-connections", authenticateToken, matchActionsController.getMyConnections);
router.get("/accepted-connections", authenticateToken, matchActionsController.getAcceptedConnections);
router.get("/initial-matches", authenticateToken, matchActionsController.getInitialMatches);
router.post("/connect-selected", authenticateToken, matchActionsController.connectWithSelected);
router.put("/display-preference", authenticateToken, matchActionsController.updateDisplayPreference);

export default router;