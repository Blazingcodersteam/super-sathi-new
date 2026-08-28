import { Router } from 'express';
import { uploadPhoto, uploadMultiplePhotos, getUserPhotos, deletePhoto, setPrimaryPhoto } from '../Controllers/PhotoController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Upload single photo
router.post('/upload', authenticateToken, uploadPhoto);

// Upload multiple photos
router.post('/upload-multiple', authenticateToken, uploadMultiplePhotos);

// Get user photos
router.get('/', authenticateToken, getUserPhotos);

// Delete photo
router.delete('/:photoId', authenticateToken, deletePhoto);

// Set primary photo
router.put('/:photoId/primary', authenticateToken, setPrimaryPhoto);

export default router;