import { Router } from "express";
import * as searchController from "../Controllers/SearchController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Search routes (all require authentication)
router.get("/profiles", authenticateToken, searchController.searchProfiles);
router.get("/profiles-comprehensive", authenticateToken, searchController.searchProfilesComprehensive);
router.get("/near-me", authenticateToken, searchController.searchNearMe);
router.get("/vivaaha-id/:vivaaha_user_id", authenticateToken, searchController.searchByVivahaId);
router.get("/profile/:profileId", authenticateToken, searchController.getProfileById);

export default router;