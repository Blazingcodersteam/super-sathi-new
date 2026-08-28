"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const matchController = require("../Controllers/MatchController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// All match routes require authentication
router.use(auth_1.authenticateToken);
// My connections (connected matches)
router.get("/my-connections", matchController.getMyConnections);
// Today's matches
router.get("/today", matchController.getTodayMatches);
// Match profile details
router.get("/profile/:matchId", matchController.getMatchProfile);
// Compare profiles
router.get("/compare/:matchId", matchController.compareProfiles);
exports.default = router;
//# sourceMappingURL=matchRoutes.js.map