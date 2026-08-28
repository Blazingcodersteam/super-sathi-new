import * as jwt from 'jsonwebtoken';
import * as utils from 'util';

const db = require('../database');
const query = utils.promisify(db.query).bind(db);

interface AuthPayload {
  id: number;
  email: string;
  user_type: string;
  user_type_id: number;
}

// Universal authentication helper
export const getAuthenticatedUser = async (token: string): Promise<any> => {
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'your-secret-key') as AuthPayload;
    
    let userData = null;
    
    if (decoded.user_type === 'vendor') {
      // Get vendor data
      const vendor: any[] = await query(`
        SELECT
          v.*,
          vc.title as category_name,
          vc.description as category_description
        FROM vendors v
        LEFT JOIN vendor_categories vc ON v.category_id = vc.id
        WHERE v.id = ? AND v.status = 'active'
      `, [decoded.id]);
      
      if (vendor.length > 0) {
        userData = {
          ...vendor[0],
          user_type: 'vendor',
          table_source: 'vendors'
        };
        // Remove password from response
        delete userData.password;
      }
    } else if (decoded.user_type === 'user') {
      // Get user data from users table
      const user: any[] = await query(`
        SELECT u.*, ut.type_name as user_type_name
        FROM users u
        LEFT JOIN user_type_master ut ON u.user_type_id = ut.id
        WHERE u.id = ? AND u.status = 'active'
      `, [decoded.id]);
      
      if (user.length > 0) {
        userData = {
          ...user[0],
          user_type: 'user',
          table_source: 'users'
        };
        // Remove password from response
        delete userData.password;
      }
    }
    
    return userData;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Get user type from user_type_master
export const getUserTypeInfo = async (userTypeId: number): Promise<any> => {
  try {
    const userType: any[] = await query(
      'SELECT * FROM user_type_master WHERE id = ? AND status = 1',
      [userTypeId]
    );
    
    return userType.length > 0 ? userType[0] : null;
  } catch (error) {
    throw new Error('Error fetching user type information');
  }
};

// Check if user type is vendor
export const isVendorUserType = async (userTypeId: number): Promise<boolean> => {
  try {
    const userType: any[] = await query(
      "SELECT id FROM user_type_master WHERE id = ? AND type_name = 'vendor' AND status = 1",
      [userTypeId]
    );
    
    return userType.length > 0;
  } catch (error) {
    return false;
  }
};