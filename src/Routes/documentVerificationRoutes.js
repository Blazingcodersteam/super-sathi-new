"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const DocumentVerificationController_1 = require("../Controllers/DocumentVerificationController");
const router = (0, express_1.Router)();
// MEON DigiLocker Aadhaar verification routes
router.post('/aadhaar/generate-url', auth_1.authenticateToken, DocumentVerificationController_1.generateDigiLockerURL);
router.post('/aadhaar/retrieve-data', auth_1.authenticateToken, DocumentVerificationController_1.retrieveAadhaarData);
router.get('/status', auth_1.authenticateToken, DocumentVerificationController_1.getVerificationStatus);
exports.default = router;
//# sourceMappingURL=documentVerificationRoutes.js.map