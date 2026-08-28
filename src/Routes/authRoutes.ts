import { Router } from "express";
import * as authController from "../Controllers/AuthController";

const router = Router();

// Authentication routes
router.post("/before-otp", authController.beforeOTP);
router.post("/send-otp", authController.sendOTP);
router.post("/login", authController.loginWithPassword);
router.post("/login-otp", authController.loginWithOTP);

export default router;