"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRoles = void 0;
const jsonwebtoken_1 = require("jsonwebtoken");
const verifyRoles = (allowedRoles) => {
    return (req, res, next) => {
        var _a;
        try {
            const token = (_a = req.header('Authorization')) === null || _a === void 0 ? void 0 : _a.replace('Bearer ', '');
            if (!token) {
                return res.status(401).json({ message: 'Access denied. No token provided.' });
            }
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET_KEY);
            // Check if user's role is in allowed roles
            const userRole = decoded.role_id || decoded.role;
            if (!allowedRoles.includes(userRole)) {
                return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
            }
            req.user = decoded;
            next();
        }
        catch (error) {
            res.status(400).json({ message: 'Invalid token.' });
        }
    };
};
exports.verifyRoles = verifyRoles;
//# sourceMappingURL=verifyRoles.js.map