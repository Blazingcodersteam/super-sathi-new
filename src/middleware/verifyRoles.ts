import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const verifyRoles = (allowedRoles: (string | number)[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
      }

      const decoded: any = jwt.verify(token, process.env.JWT_SECRET_KEY!);
      
      // Check if user's role is in allowed roles
      const userRole = decoded.role_id || decoded.role;
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
      }

      req.user = decoded;
      next();
    } catch (error) {
      res.status(400).json({ message: 'Invalid token.' });
    }
  };
};