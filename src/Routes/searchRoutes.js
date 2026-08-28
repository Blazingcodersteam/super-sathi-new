"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const searchController = require("../Controllers/SearchController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Search routes (all require authentication)
router.get("/profiles", auth_1.authenticateToken, searchController.searchProfiles);
router.get("/profiles-comprehensive", auth_1.authenticateToken, searchController.searchProfilesComprehensive);
router.get("/near-me", auth_1.authenticateToken, searchController.searchNearMe);
router.get("/vivaaha-id/:vivaaha_user_id", auth_1.authenticateToken, searchController.searchByVivahaId);
router.get("/profile/:profileId", auth_1.authenticateToken, searchController.getProfileById);
exports.default = router;
//# sourceMappingURL=searchRoutes.js.map