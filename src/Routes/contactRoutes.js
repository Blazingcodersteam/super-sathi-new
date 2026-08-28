"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const contactController = require("../Controllers/ContactController");
const router = (0, express_1.Router)();
// Public route - Submit contact form
router.post("/submit", contactController.submitContactForm);
exports.default = router;
//# sourceMappingURL=contactRoutes.js.map