"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const auth_1 = require("../middleware/auth");
const MatchmakingController_1 = require("../Controllers/MatchmakingController");
const router = express.Router();
// Match Score API
router.post("/match-score", auth_1.authenticateToken, MatchmakingController_1.getAshtakootScore);
// Horoscope Compatibility API (no auth required)
router.post("/horoscope-compatibility", MatchmakingController_1.getHoroscopeCompatibility);
exports.default = router;
//# sourceMappingURL=matchmakingRoutes.js.map