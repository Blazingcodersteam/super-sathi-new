import { Router } from "express";
import * as contactController from "../Controllers/ContactController";

const router = Router();

// Public route - Submit contact form
router.post("/submit", contactController.submitContactForm);

export default router;