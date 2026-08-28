"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadPhoto = uploadPhoto;
exports.uploadMultiplePhotos = uploadMultiplePhotos;
exports.getUserPhotos = getUserPhotos;
exports.deletePhoto = deletePhoto;
exports.setPrimaryPhoto = setPrimaryPhoto;
const client_s3_1 = require("@aws-sdk/client-s3");
const utils = require("util");
const multer = require("multer");
const path = require("path");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// AWS S3 Configuration
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";
const MAX_PHOTOS = 20;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
// Multer configuration for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (ALLOWED_FORMATS.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file format. Only ${ALLOWED_FORMATS.join(', ')} are allowed.`));
        }
    },
});
const singleUpload = upload.single('photo');
const multipleUpload = upload.array('photos', MAX_PHOTOS);
// Upload Photo
async function uploadPhoto(req, res) {
    try {
        const userId = req.user.user_id;
        // Check current photo count
        const [photoCount] = await query("SELECT COUNT(*) as count FROM user_photos WHERE user_id = ?", [userId]);
        if (photoCount.count >= MAX_PHOTOS) {
            return res.status(400).json({
                success: false,
                message: `Maximum ${MAX_PHOTOS} photos allowed per profile`
            });
        }
        singleUpload(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({
                            success: false,
                            message: 'File size must be less than 15MB'
                        });
                    }
                }
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No photo file provided'
                });
            }
            try {
                const isPrimary = req.body.is_primary === 'true' || req.body.is_primary === true;
                const fileExtension = path.extname(req.file.originalname);
                const fileName = `profiles/${userId}/${Date.now()}${fileExtension}`;
                // Upload to S3
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                };
                await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
                const photoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
                // If setting as primary, unset other primary photos
                if (isPrimary) {
                    await query("UPDATE user_photos SET is_primary = FALSE WHERE user_id = ?", [userId]);
                }
                // Save to database
                const result = await query("INSERT INTO user_photos (user_id, photo_url, is_primary, photo_type) VALUES (?, ?, ?, 'gallery')", [userId, photoUrl, isPrimary]);
                // const result = await query(
                //   "INSERT INTO user_photos (user_id, photo_url, is_primary, photo_type) VALUES (?, ?, ?, 'gallery')",
                //   [userId, photoUrl, 1]
                // );
                // Update profile picture in user_profiles if this is primary
                if (isPrimary) {
                    await query("UPDATE user_profiles SET profile_picture = ? WHERE user_id = ?", [photoUrl, userId]);
                }
                res.json({
                    success: true,
                    message: 'Photo uploaded successfully',
                    data: {
                        id: result.insertId,
                        photo_url: photoUrl,
                        is_primary: isPrimary
                    }
                });
            }
            catch (uploadError) {
                console.error('Photo upload error:', uploadError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload photo'
                });
            }
        });
    }
    catch (error) {
        console.error('Upload Photo Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
// Upload Multiple Photos
async function uploadMultiplePhotos(req, res) {
    try {
        const userId = req.user.user_id;
        // Check current photo count
        const [photoCount] = await query("SELECT COUNT(*) as count FROM user_photos WHERE user_id = ?", [userId]);
        multipleUpload(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({
                            success: false,
                            message: 'Each file must be less than 15MB'
                        });
                    }
                    if (err.code === 'LIMIT_FILE_COUNT') {
                        return res.status(400).json({
                            success: false,
                            message: `Maximum ${MAX_PHOTOS} photos allowed`
                        });
                    }
                }
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No photo files provided'
                });
            }
            const totalPhotos = photoCount.count + req.files.length;
            if (totalPhotos > MAX_PHOTOS) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot upload ${req.files.length} photos. Maximum ${MAX_PHOTOS} photos allowed per profile. You currently have ${photoCount.count} photos.`
                });
            }
            try {
                const uploadedPhotos = [];
                const { primary_photo_index = -1 } = req.body;
                const primaryIndex = parseInt(primary_photo_index);
                // If setting a primary photo, unset existing primary photos
                if (primaryIndex >= 0 && primaryIndex < req.files.length) {
                    await query("UPDATE user_photos SET is_primary = FALSE WHERE user_id = ?", [userId]);
                }
                // Upload all photos
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const fileExtension = path.extname(file.originalname);
                    const fileName = `profiles/${userId}/${Date.now()}_${i}${fileExtension}`;
                    const isPrimary = i === primaryIndex;
                    // Upload to S3
                    const uploadParams = {
                        Bucket: BUCKET_NAME,
                        Key: fileName,
                        Body: file.buffer,
                        ContentType: file.mimetype,
                    };
                    await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
                    const photoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
                    // Save to database
                    const result = await query("INSERT INTO user_photos (user_id, photo_url, is_primary, photo_type) VALUES (?, ?, ?, 'gallery')", [userId, photoUrl, isPrimary]);
                    // Update profile picture if this is primary
                    if (isPrimary) {
                        await query("UPDATE user_profiles SET profile_picture = ? WHERE user_id = ?", [photoUrl, userId]);
                    }
                    uploadedPhotos.push({
                        id: result.insertId,
                        photo_url: photoUrl,
                        is_primary: isPrimary,
                        original_name: file.originalname
                    });
                }
                res.json({
                    success: true,
                    message: `${req.files.length} photos uploaded successfully`,
                    data: {
                        uploaded_photos: uploadedPhotos,
                        total_photos: totalPhotos
                    }
                });
            }
            catch (uploadError) {
                console.error('Multiple photos upload error:', uploadError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload photos'
                });
            }
        });
    }
    catch (error) {
        console.error('Upload Multiple Photos Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
// Get User Photos
async function getUserPhotos(req, res) {
    try {
        const userId = req.user.user_id;
        const photos = await query("SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC", [userId]);
        res.json({
            success: true,
            data: {
                photos,
                count: photos.length,
                max_allowed: MAX_PHOTOS
            }
        });
    }
    catch (error) {
        console.error('Get Photos Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
// Delete Photo
async function deletePhoto(req, res) {
    try {
        const userId = req.user.user_id;
        const { photoId } = req.params;
        // Get photo details
        const [photo] = await query("SELECT * FROM user_photos WHERE id = ? AND user_id = ?", [photoId, userId]);
        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Photo not found'
            });
        }
        try {
            // Delete from S3
            const key = photo.photo_url.split('.amazonaws.com/')[1];
            await s3Client.send(new client_s3_1.DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key
            }));
        }
        catch (s3Error) {
            console.error('S3 delete error:', s3Error);
        }
        // Delete from database
        await query("DELETE FROM user_photos WHERE id = ?", [photoId]);
        // If this was primary photo, clear profile picture
        if (photo.is_primary) {
            await query("UPDATE user_profiles SET profile_picture = NULL WHERE user_id = ?", [userId]);
        }
        res.json({
            success: true,
            message: 'Photo deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete Photo Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
// Set Primary Photo
async function setPrimaryPhoto(req, res) {
    try {
        const userId = req.user.user_id;
        const { photoId } = req.params;
        // Verify photo belongs to user
        const [photo] = await query("SELECT * FROM user_photos WHERE id = ? AND user_id = ?", [photoId, userId]);
        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Photo not found'
            });
        }
        // Unset all primary photos
        await query("UPDATE user_photos SET is_primary = FALSE WHERE user_id = ?", [userId]);
        // Set new primary photo
        await query("UPDATE user_photos SET is_primary = TRUE WHERE id = ?", [photoId]);
        // Update profile picture
        await query("UPDATE user_profiles SET profile_picture = ? WHERE user_id = ?", [photo.photo_url, userId]);
        res.json({
            success: true,
            message: 'Primary photo updated successfully'
        });
    }
    catch (error) {
        console.error('Set Primary Photo Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
//# sourceMappingURL=PhotoController.js.map