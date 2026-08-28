"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAlerts = getAlerts;
exports.markAlertRead = markAlertRead;
exports.createAlert = createAlert;
exports.createProfileLikeAlert = createProfileLikeAlert;
exports.createProfileViewAlert = createProfileViewAlert;
exports.createInterestAlert = createInterestAlert;
exports.createPhotoRequestAlert = createPhotoRequestAlert;
exports.createShortlistAlert = createShortlistAlert;
exports.createConnectNowAlert = createConnectNowAlert;
const utils = __importStar(require("util"));
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Get Alerts
function getAlerts(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = req.user.user_id;
            const { page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;
            const alerts = yield query(`
      SELECT 
        ua.id,
        ua.title,
        ua.message,
        ua.is_read,
        ua.created_at,
        atm.type_name,
        atm.icon,
        up.first_name as from_user_name,
        up.profile_picture as from_user_picture,
        TIMESTAMPDIFF(MINUTE, ua.created_at, NOW()) as minutes_ago
      FROM user_alerts ua
      LEFT JOIN alert_types_master atm ON ua.alert_type_id = atm.id
      LEFT JOIN user_profiles up ON ua.from_user_id = up.user_id
      WHERE ua.user_id = ?
      ORDER BY ua.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), offset]);
            const unreadCount = yield query(`
      SELECT COUNT(*) as count FROM user_alerts 
      WHERE user_id = ? AND is_read = FALSE
    `, [userId]);
            res.json({
                success: true,
                alerts,
                unread_count: unreadCount[0].count
            });
        }
        catch (error) {
            console.error("Get Alerts Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });
}
// Mark Alert as Read
function markAlertRead(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = req.user.user_id;
            const { alert_id } = req.params;
            yield query(`
      UPDATE user_alerts 
      SET is_read = TRUE, read_at = NOW() 
      WHERE id = ? AND user_id = ?
    `, [alert_id, userId]);
            res.json({
                success: true,
                message: "Alert marked as read"
            });
        }
        catch (error) {
            console.error("Mark Alert Read Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });
}
// Create Alert (Internal function)
function createAlert(userId, alertTypeId, fromUserId, title, message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield query(`
      INSERT INTO user_alerts (user_id, alert_type_id, from_user_id, title, message) 
      VALUES (?, ?, ?, ?, ?)
    `, [userId, alertTypeId, fromUserId, title, message]);
        }
        catch (error) {
            console.error("Create Alert Error:", error);
        }
    });
}
// Profile Like Alert
function createProfileLikeAlert(likedUserId, likerUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [likerProfile] = yield query(`
    SELECT first_name FROM user_profiles WHERE user_id = ?
  `, [likerUserId]);
        if (likerProfile) {
            yield createAlert(likedUserId, 1, // profile_like
            likerUserId, "Profile Liked", `${likerProfile.first_name} liked your profile`);
        }
    });
}
// Profile View Alert
function createProfileViewAlert(viewedUserId, viewerUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [viewerProfile] = yield query(`
    SELECT first_name FROM user_profiles WHERE user_id = ?
  `, [viewerUserId]);
        if (viewerProfile) {
            yield createAlert(viewedUserId, 3, // profile_view
            viewerUserId, "Profile Viewed", `${viewerProfile.first_name} viewed your profile`);
        }
    });
}
// Interest Alert
function createInterestAlert(receiverUserId, senderUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [senderProfile] = yield query(`
    SELECT first_name FROM user_profiles WHERE user_id = ?
  `, [senderUserId]);
        if (senderProfile) {
            yield createAlert(receiverUserId, 2, // interest_received
            senderUserId, "Interest Received", `${senderProfile.first_name} sent you an interest`);
        }
    });
}
// Photo Request Alert
function createPhotoRequestAlert(receiverUserId, senderUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [senderProfile] = yield query(`
    SELECT first_name FROM user_profiles WHERE user_id = ?
  `, [senderUserId]);
        if (senderProfile) {
            yield createAlert(receiverUserId, 4, // photo_request
            senderUserId, "Photo Request", `${senderProfile.first_name} requested your photos`);
        }
    });
}
// Shortlist Alert
function createShortlistAlert(shortlistedUserId, shortlisterUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [shortlisterProfile] = yield query(`
    SELECT first_name FROM user_profiles WHERE user_id = ?
  `, [shortlisterUserId]);
        if (shortlisterProfile) {
            yield createAlert(shortlistedUserId, 5, // shortlisted
            shortlisterUserId, "Added to Shortlist", `${shortlisterProfile.first_name} added you to shortlist`);
        }
    });
}
// Connect Now Alert
function createConnectNowAlert(receiverUserId, senderUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [senderProfile] = yield query(`
    SELECT first_name FROM user_profiles WHERE user_id = ?
  `, [senderUserId]);
        if (senderProfile) {
            yield createAlert(receiverUserId, 6, // connect_request
            senderUserId, "Connection Request", `${senderProfile.first_name} wants to connect with you`);
        }
    });
}
