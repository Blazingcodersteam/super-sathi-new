import { Router } from "express";
import * as googleAuthController from "../Controllers/GoogleAuthController";
import passport from "../config/passport";

const router = Router();

// Web Google OAuth routes
router.get("/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get("/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  googleAuthController.googleCallback
);

// Mobile Google login
router.post("/google/mobile", googleAuthController.googleMobileLogin);

export default router;