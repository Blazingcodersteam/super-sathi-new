import { Request, Response } from "express";
import axios from "axios";
import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

const MEON_BASE_URL = process.env.MEON_BASE_URL || "https://digilocker.meon.co.in";

export async function handleDigiLockerCallback(req: Request, res: Response) {
  try {
    const { code, state, verification_id } = req.query;

    console.log('=== DIGILOCKER CALLBACK RECEIVED ===');
    console.log('Code:', code);
    console.log('State:', state);
    console.log('Verification ID:', verification_id);

    if (!verification_id) {
      throw new Error('Missing verification_id parameter');
    }

    if (!state) {
      throw new Error('Missing state parameter from DigiLocker');
    }

    // Get verification record
    const [verification] = await query(
      "SELECT id, user_id, client_token, digi_url FROM document_verification WHERE id = ?",
      [verification_id]
    );

    if (!verification) {
      throw new Error('Verification record not found');
    }

    console.log('Using State from DigiLocker callback:', state);

    // Auto-trigger data retrieval with state from callback
    const dataResponse = await axios.post(`${MEON_BASE_URL}/v2/send_entire_data`, {
      client_token: verification.client_token,
      state: state,
      status: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    console.log('=== MEON API RESPONSE ===');
    console.log('Response:', JSON.stringify(dataResponse.data, null, 2));

    if (dataResponse.data?.success && dataResponse.data?.data) {
      const data = dataResponse.data.data;

      // Update verification record
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
         WHERE id = ?`,
        [
          JSON.stringify(data),
          data.name || '',
          data.dob || '',
          data.gender || '',
          data.aadhar_no || '',
          verification.id
        ]
      );

      // Update user profile
      await query(
        "UPDATE user_profiles SET aadhaar_verified = TRUE WHERE user_id = ?",
        [verification.user_id]
      );

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Verification Complete</title>
        <style>
          body { font-family: Arial; padding: 40px; text-align: center; }
          .success { color: #4CAF50; font-size: 24px; margin: 20px 0; }
          .info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; text-align: left; }
        </style>
      </head>
      <body>
        <h2 class="success">✓ Aadhaar Verification Successful!</h2>
        <div class="info">
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>DOB:</strong> ${data.dob}</p>
          <p><strong>Gender:</strong> ${data.gender}</p>
          <p><strong>Aadhaar:</strong> ${data.aadhar_no}</p>
          <p><strong>Address:</strong> ${data.aadhar_address}</p>
        </div>
        <p>You can close this window now.</p>
        <script>
          setTimeout(() => {
            window.opener?.postMessage({ type: 'AADHAAR_VERIFIED', success: true }, '*');
            window.close();
          }, 3000);
        </script>
      </body>
      </html>`;

      return res.send(html);
    }

    throw new Error('Failed to retrieve verification data');

  } catch (error: any) {
    console.error("Callback Error:", error.message);
    console.error("Full Error:", error.response?.data || error);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Verification Failed</title>
      <style>
        body { font-family: Arial; padding: 40px; text-align: center; }
        .error { color: #f44336; font-size: 24px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h2 class="error">✗ Verification Failed</h2>
      <p>${error.message}</p>
      <p>Please try again.</p>
      <script>
        setTimeout(() => {
          window.opener?.postMessage({ type: 'AADHAAR_VERIFIED', success: false }, '*');
          window.close();
        }, 3000);
      </script>
    </body>
    </html>`;

    res.send(html);
  }
}