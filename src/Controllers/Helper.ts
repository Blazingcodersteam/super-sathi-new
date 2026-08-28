import * as crypto from "crypto";
// import * as jwt from "jsonwebtoken";
// import { Request, Response, NextFunction } from "express";
const dotenv = require("dotenv");
dotenv.config();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET_KEY;
const PASSWORD_SECRET_KEY = process.env.PASSWORD_SECRET_KEY;
const AWS = require("aws-sdk");
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(403).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1]; // Remove 'Bearer'

  jwt.verify(token, process.env.JWT_SECRET_KEY!, (err, decoded: any) => {
    if (err) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // console.log("decoded", decoded);
    req.user = { user_id: decoded.user_id, email_id: decoded.email_id };
    next();
  });
};

export function isValidElement(data) {
  return data != null || data != undefined;
}

// export function md5Hash(password: string): string {
//   return crypto.createHash("md5").update(password).digest("hex");
// }

export function encodeBase64(data: string): string {
  return Buffer.from(data).toString("base64");
}

export function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf-8");
}
// export function hashPassword(password) {
//   return crypto
//     .createHmac("sha256", PASSWORD_SECRET_KEY)
//     .update(password)
//     .digest("base64");
// }
// export function verifyToken(req, res, next) {
//   const authHeader = req.headers["authorization"];
//   console.log(authHeader);
//   if (!authHeader) {
//     return res.status(403).send("A token is required for authentication");
//   }
//   const token = authHeader.split(" ")[1];
//   console.log(token);
//   try {
//     const decoded = jwt.verify(token, SECRET_KEY);
//     req.user = decoded; // Save the decoded token to the request object
//   } catch (err) {
//     return res.status(401).send("Invalid Token");
//   }
//   return next();
// }

// const verifyToken = (req, res, next) => {
//   const token = req.headers["authorization"];
//   if (!token) return res.status(403).json({ message: "No token provided" });

//   jwt.verify(token, JWT_SECRET, (err, decoded) => {
//     if (err) return res.status(401).json({ message: "Invalid token" });
//     req.user = decoded;
//     next();
//   });
// };

// export function refreshToken(email, id) {
//   const refreshToken = jwt.sign({ email, id }, JWT_SECRET, {
//     expiresIn: "59m",
//   });
// }

export function formatDate(dateStr) {
  const [day, month, year] = dateStr.split("/");
  // Convert to the desired format
  const formattedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(
    2,
    "0"
  )}`;
  return formattedDate;
}

export function tryParseJSON(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function uploadFilestoS3(upload_file, document_type) {
  try {
    if (!upload_file) {
      throw new Error("No file provided");
    }

    if (!document_type) {
      throw new Error("Missing document_type");
    }

    const fileName = `${upload_file.name}`;

    const uploadParams = {
      // Bucket: "upload-documents",
      Bucket: "masar-upload-documents",
      Key: `${fileName}`,
      Body: upload_file.data,
      ContentType: upload_file.mimetype,
    };
    const uploadResult = await s3.upload(uploadParams).promise();
    return {
      success: true,
      message: "File uploaded successfully",
      fileUrl: uploadResult.Location,
      key: uploadResult.Key,
    };
  } catch (error) {
    console.error("S3 Upload Error:", {
      message: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      message: "Error uploading file to S3",
      error: error.message,
    };
  }
}
