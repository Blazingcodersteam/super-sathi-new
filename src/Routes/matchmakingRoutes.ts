import * as express from "express";
import { authenticateToken } from "../middleware/auth";
import { getAshtakootScore, getHoroscopeCompatibility } from "../Controllers/MatchmakingController";

const router = express.Router();

// Match Score API
router.post("/match-score", authenticateToken, getAshtakootScore);

// Horoscope Compatibility API (no auth required)
router.post("/horoscope-compatibility", getHoroscopeCompatibility);

export default router;