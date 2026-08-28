"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const FeatureController_1 = require("../Controllers/FeatureController");
const router = (0, express_1.Router)();
// Feature access control
router.post('/check-access', auth_1.authenticateToken, FeatureController_1.checkFeatureAccess);
router.post('/use', auth_1.authenticateToken, FeatureController_1.useFeature);
// Plan comparison (public)
router.get('/plan-comparison', FeatureController_1.getPlanComparison);
// Marriage confirmation status
router.get('/marriage-confirmation-status', auth_1.authenticateToken, FeatureController_1.getMarriageConfirmationStatus);
exports.default = router;
//# sourceMappingURL=featureRoutes.js.map