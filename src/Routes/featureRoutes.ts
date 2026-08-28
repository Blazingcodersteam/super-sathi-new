import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { 
  checkFeatureAccess,
  useFeature,
  getPlanComparison,
  getMarriageConfirmationStatus
} from '../Controllers/FeatureController';

const router = Router();

// Feature access control
router.post('/check-access', authenticateToken, checkFeatureAccess);
router.post('/use', authenticateToken, useFeature);

// Plan comparison (public)
router.get('/plan-comparison', getPlanComparison);

// Marriage confirmation status
router.get('/marriage-confirmation-status', authenticateToken, getMarriageConfirmationStatus);

export default router;
