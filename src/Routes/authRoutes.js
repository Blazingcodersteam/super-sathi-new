"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController = require("../Controllers/AuthController");
const router = (0, express_1.Router)();
// Authentication routes
router.post("/before-otp", authController.beforeOTP);
router.post("/send-otp", authController.sendOTP);
router.post("/login", authController.loginWithPassword);
router.post("/login-otp", authController.loginWithOTP);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map