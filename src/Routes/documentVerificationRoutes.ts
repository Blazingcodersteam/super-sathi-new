import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { 
  generateDigiLockerURL,
  retrieveAadhaarData,
  getVerificationStatus
} from '../Controllers/DocumentVerificationController';

const router = Router();

// MEON DigiLocker Aadhaar verification routes
router.post('/aadhaar/generate-url', authenticateToken, generateDigiLockerURL);
router.post('/aadhaar/retrieve-data', authenticateToken, retrieveAadhaarData);
router.get('/status', authenticateToken, getVerificationStatus);

export default router;