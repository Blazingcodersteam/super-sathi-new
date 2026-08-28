import * as utils from "util";
import axios from "axios";
import { Request, Response } from "express";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Meon DigiLocker API Configuration
const MEON_BASE_URL = process.env.MEON_BASE_URL || "https://digilocker.meon.co.in";
const COMPANY_NAME = process.env.MEON_COMPANY_NAME || "sidlax";
const SECRET_TOKEN = process.env.MEON_SECRET_TOKEN;

// Generate Access Token and State
async function generateAccessToken() {
  try {
    const response = await axios.post(`${MEON_BASE_URL}/get_access_token`, {
      company_name: COMPANY_NAME,
      secret_token: SECRET_TOKEN
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (response.data?.status && response.data?.client_token) {
      return {
        client_token: response.data.client_token,
        state: response.data.state || response.data.session_id
      };
    }
    throw new Error("Invalid token response");
  } catch (error: any) {
    console.error("Meon Access Token Error:", error.response?.status || error.message);
    throw error;
  }
}

// Generate DigiLocker URL for Aadhaar verification
export async function generateDigiLockerURL(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check if already verified
    const [existing] = await query(
      "SELECT verification_status FROM document_verification WHERE user_id = ? AND document_type = 'aadhaar'",
      [userId]
    );

    if (existing && existing.verification_status === 'verified') {
      return res.status(400).json({
        success: false,
        message: "Aadhaar already verified"
      });
    }

    // Generate access token and state
    const { client_token, state } = await generateAccessToken();

    // Store session info
    const result = await query(
      `INSERT INTO document_verification (user_id, document_type, document_number, verification_status, client_token, created_at)
       VALUES (?, 'aadhaar', '', 'pending', ?, NOW())
       ON DUPLICATE KEY UPDATE client_token = VALUES(client_token), updated_at = NOW()`,
      [userId, client_token]
    );

    // Generate DigiLocker URL
    const urlResponse = await axios.post(`${MEON_BASE_URL}/digi_url`, {
      client_token: client_token,
      redirect_url: "https://digilocker.meon.co.in/digilocker/thank-you-page",
      company_name: COMPANY_NAME,
      documents: "aadhaar",
      other_documents: []
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    if (!urlResponse.data?.success || !urlResponse.data?.url) {
      throw new Error("Failed to generate DigiLocker URL");
    }

    res.json({
      success: true,
      message: "DigiLocker URL generated successfully",
      digi_url: urlResponse.data.url,
      client_token: client_token,
      state: state
    });

  } catch (error: any) {
    console.error("Generate DigiLocker URL Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to generate verification URL. Please try again."
    });
  }
}

// Retrieve Aadhaar data after DigiLocker consent
export async function retrieveAadhaarData(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.user_id;
    const { client_token, state, status } = req.body;

    console.log('=== RETRIEVE AADHAAR DATA REQUEST ===');
    console.log('User ID:', userId);
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('Headers:', JSON.stringify(req.headers, null, 2));

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!client_token) {
      return res.status(400).json({
        success: false,
        message: "client_token is required"
      });
    }

    if (status === false) {
      await query(
        `UPDATE document_verification SET verification_status = 'rejected', rejected_reason = 'User denied consent', updated_at = NOW()
         WHERE user_id = ? AND document_type = 'aadhaar' AND client_token = ?`,
        [userId, client_token]
      );

      return res.status(400).json({
        success: false,
        message: "Verification cancelled. Consent was not provided."
      });
    }

    // Log MEON API request
    const meonRequest = {
      client_token: client_token,
      state: state,
      status: true
    };
    console.log('=== MEON API REQUEST ===');
    console.log('URL:', `${MEON_BASE_URL}/v2/send_entire_data`);
    console.log('Request Body:', JSON.stringify(meonRequest, null, 2));

    // Try POST request (as indicated by Allow header: POST, OPTIONS)
    const dataResponse = await axios.post(`${MEON_BASE_URL}/v2/send_entire_data`, meonRequest, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    console.log('=== MEON API RESPONSE ===');
    console.log('Status:', dataResponse.status);
    console.log('Headers:', JSON.stringify(dataResponse.headers, null, 2));
    console.log('Response Body:', JSON.stringify(dataResponse.data, null, 2));

    if (!dataResponse.data?.success || !dataResponse.data?.data) {
      throw new Error("Failed to retrieve verification data");
    }

    const data = dataResponse.data.data;

    // Convert date format from DD-MM-YYYY to YYYY-MM-DD
    let formattedDob = null;
    if (data.dob) {
      const [day, month, year] = data.dob.split('-');
      formattedDob = `${year}-${month}-${day}`;
    }

    // Map gender to database enum (M, F, O)
    let genderCode = null;
    if (data.gender) {
      const genderLower = data.gender.toLowerCase();
      if (genderLower === 'male') genderCode = 'M';
      else if (genderLower === 'female') genderCode = 'F';
      else genderCode = 'O';
    }

    // Check if this Aadhaar is already verified by another ACTIVE user
    if (data.aadhar_no) {
      const [existingAadhaar] = await query(
        `SELECT dv.user_id FROM document_verification dv
         JOIN users u ON dv.user_id = u.id
         WHERE dv.aadhaar_number = ? AND dv.verification_status = 'verified' AND dv.user_id != ? AND u.status != 4`,
        [data.aadhar_no, userId]
      );

      if (existingAadhaar) {
        await query(
          `UPDATE document_verification SET verification_status = 'rejected', rejected_reason = 'Aadhaar already linked to another account', updated_at = NOW()
           WHERE user_id = ? AND document_type = 'aadhaar' AND client_token = ?`,
          [userId, client_token]
        );

        return res.status(400).json({
          success: false,
          message: "This Aadhaar is already verified with another profile. Each Aadhaar can only be linked to one account."
        });
      }
    }



    // Store successful verification
    await query(
      `UPDATE document_verification SET
       verification_status = 'verified',
       document_data = ?,
       verified_name = ?,
       verified_dob = ?,
       verified_gender = ?,
       aadhaar_number = ?,
       verified_at = NOW(),
       updated_at = NOW()
       WHERE user_id = ? AND document_type = 'aadhaar' AND client_token = ?`,
      [
        JSON.stringify(data),
        data.name || '',
        formattedDob,
        genderCode,
        data.aadhar_no || '',
        userId,
        client_token
      ]
    );

    // Update user profile verification status
    await query(
      "UPDATE user_profiles SET aadhaar_verified = 1 WHERE user_id = ?",
      [userId]
    );

    res.json({
      success: true,
      message: "Aadhaar verification completed successfully",
      data: {
        name: data.name || '',
        dob: data.dob || '',
        gender: data.gender || '',
        aadhaar_number: data.aadhar_no || '',
        address: data.aadhar_address || ''
      }
    });

  } catch (error: any) {
    console.log('=== MEON API ERROR ===');
    console.log('Error Message:', error.message);
    console.log('Error Response Status:', error.response?.status);
    console.log('Error Response Headers:', JSON.stringify(error.response?.headers, null, 2));
    console.log('Error Response Body:', JSON.stringify(error.response?.data, null, 2));
    console.log('Full Error:', error);

    const userId = (req as any).user?.user_id;
    const { client_token } = req.body;

    if (userId && client_token) {
      await query(
        `UPDATE document_verification SET verification_status = 'rejected', rejected_reason = ?, updated_at = NOW()
         WHERE user_id = ? AND document_type = 'aadhaar' AND client_token = ?`,
        [error.message, userId, client_token]
      );
    }

    res.status(500).json({
      success: false,
      message: "Failed to complete verification. Please try again."
    });
  }
}

// Get verification status
export async function getVerificationStatus(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const verifications = await query(
      `SELECT document_type, verification_status, verified_name, verified_dob, verified_gender,
       aadhaar_number, verified_at, rejected_reason, created_at
       FROM document_verification WHERE user_id = ?`,
      [userId]
    );

    const result: any = {
      aadhaar: null,
      pan: null,
      driving_license: null
    };

    verifications.forEach((verification: any) => {
      const data: any = {
        status: verification.verification_status,
        verified_at: verification.verified_at,
        rejected_reason: verification.rejected_reason,
        created_at: verification.created_at
      };

      if (verification.verification_status === 'verified') {
        data.verified_name = verification.verified_name;
        data.verified_dob = verification.verified_dob;
        data.verified_gender = verification.verified_gender;

        if (verification.document_type === 'aadhaar' && verification.aadhaar_number) {
          data.aadhaar_number = `XXXX-XXXX-${verification.aadhaar_number.slice(-4)}`;
        }
      }

      result[verification.document_type] = data;
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error("Get Verification Status Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get verification status"
    });
  }
}