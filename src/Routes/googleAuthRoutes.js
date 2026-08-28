"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const googleAuthController = require("../Controllers/GoogleAuthController");
const passport_1 = require("../config/passport");
const router = (0, express_1.Router)();
// Web Google OAuth routes
router.get("/google", passport_1.default.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", passport_1.default.authenticate("google", { failureRedirect: "/login" }), googleAuthController.googleCallback);
// Mobile Google login
router.post("/google/mobile", googleAuthController.googleMobileLogin);
exports.default = router;
//# sourceMappingURL=googleAuthRoutes.js.map