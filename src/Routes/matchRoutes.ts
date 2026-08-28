import { Router } from "express";
import * as matchController from "../Controllers/MatchController";
import * as matchActionsController from "../Controllers/MatchActionsController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// All match routes require authentication
router.use(authenticateToken);

// My connections (connected matches)
router.get("/my-connections", matchController.getMyConnections);

// Today's matches
router.get("/today", matchController.getTodayMatches);

// Match profile details
router.get("/profile/:matchId", matchController.getMatchProfile);

// Compare profiles
router.get("/compare/:matchId", matchController.compareProfiles);

export default router;