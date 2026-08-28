const dotenv = require("dotenv");
dotenv.config();
import { uploadFilestoS3 } from "../Controllers/Helper";
const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

export async function uploadFilesToServer(req: any, res: any) {
  try {
    const uploadedUrls: Record<string, string[]> = {};
    
    if (req.files && typeof req.files === "object") {
      for (const field in req.files) {
        const files = Array.isArray(req.files[field])
          ? req.files[field]
          : [req.files[field]];
        uploadedUrls[field] = [];

        for (const file of files) {
          const { fileUrl } = await uploadFilestoS3(file, field);
          uploadedUrls[field].push(fileUrl);
        }
      }
    }

    if (req.file) {
      const field = req.file.fieldname || "file";
      const { fileUrl } = await uploadFilestoS3(req.file, field);
      uploadedUrls[field] = [fileUrl];
    }

    res.status(200).json({
      success: true,
      message: "Files uploaded successfully",
      uploadedUrls,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      details: error.message,
    });
  }
}

// export default FileUploader;
