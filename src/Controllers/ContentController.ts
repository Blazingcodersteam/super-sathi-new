import * as utils from "util";
import * as fs from 'fs';
import * as path from 'path';

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Get Website Content
export async function getWebsiteContent(req, res) {
  try {
    const [content] = await query(`
      SELECT * FROM website_content ORDER BY id DESC LIMIT 1
    `);

    const [ceoContent] = await query(`
      SELECT * FROM ceo_content ORDER BY id DESC LIMIT 1
    `);

    res.json({
      success: true,
      data: {
        website_content: content || {},
        ceo_content: ceoContent || {}
      }
    });
  } catch (error) {
    console.error("Get Website Content Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Helper function to update single field
async function updateSingleField(fieldName: string, value: string) {
  const [existing] = await query(`SELECT id FROM website_content LIMIT 1`);
  
  if (existing) {
    await query(`
      UPDATE website_content SET
        ${fieldName} = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [value, existing.id]);
  } else {
    await query(`
      INSERT INTO website_content (${fieldName}) VALUES (?)
    `, [value]);
  }
}

// Update Privacy Policy (Admin)
export async function updatePrivacyPolicy(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('privacy_policy', content);
    res.json({ success: true, message: "Privacy policy updated successfully" });
  } catch (error) {
    console.error("Update Privacy Policy Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Terms & Conditions (Admin)
export async function updateTermsConditions(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('terms_conditions', content);
    res.json({ success: true, message: "Terms & conditions updated successfully" });
  } catch (error) {
    console.error("Update Terms Conditions Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Refund Policy (Admin)
export async function updateRefundPolicy(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('refund_policy', content);
    res.json({ success: true, message: "Refund policy updated successfully" });
  } catch (error) {
    console.error("Update Refund Policy Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Safe Policy (Admin)
export async function updateSafePolicy(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('safe_policy', content);
    res.json({ success: true, message: "Safe policy updated successfully" });
  } catch (error) {
    console.error("Update Safe Policy Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Be Safe Online (Admin)
export async function updateBeSafeOnline(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('be_safe_online', content);
    res.json({ success: true, message: "Be safe online content updated successfully" });
  } catch (error) {
    console.error("Update Be Safe Online Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Title (Admin)
export async function updateTitle(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('title', content);
    res.json({ success: true, message: "Title updated successfully" });
  } catch (error) {
    console.error("Update Title Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Subtitle (Admin)
export async function updateSubtitle(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('subtitle', content);
    res.json({ success: true, message: "Subtitle updated successfully" });
  } catch (error) {
    console.error("Update Subtitle Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Description (Admin)
export async function updateDescription(req, res) {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }
    
    await updateSingleField('description', content);
    res.json({ success: true, message: "Description updated successfully" });
  } catch (error) {
    console.error("Update Description Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Upload Homepage Banner Images (Admin)
export async function uploadHomepageBanner(req, res) {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "At least one banner image is required" });
    }

    const imageUrls = files.map(file => {
      const fileName = `banner_${Date.now()}_${file.originalname}`;
      const filePath = path.join('uploads/banners', fileName);
      
      // Move file to permanent location
      fs.renameSync(file.path, filePath);
      
      return `/uploads/banners/${fileName}`;
    });

    await updateSingleField('homepage_banner', JSON.stringify(imageUrls));
    
    res.json({ 
      success: true, 
      message: "Homepage banner images uploaded successfully",
      data: { imageUrls }
    });
  } catch (error) {
    console.error("Upload Homepage Banner Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Upload CEO Image (Admin)
export async function uploadCeoImage(req, res) {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, message: "CEO image is required" });
    }

    const fileName = `ceo_${Date.now()}_${file.originalname}`;
    const filePath = path.join('uploads/ceo', fileName);
    
    // Move file to permanent location
    fs.renameSync(file.path, filePath);
    
    const imageUrl = `/uploads/ceo/${fileName}`;

    const [existing] = await query(`SELECT id FROM ceo_content LIMIT 1`);

    if (existing) {
      await query(`
        UPDATE ceo_content SET
          ceo_image = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [imageUrl, existing.id]);
    } else {
      await query(`
        INSERT INTO ceo_content (ceo_image) VALUES (?)
      `, [imageUrl]);
    }

    res.json({ 
      success: true, 
      message: "CEO image uploaded successfully",
      data: { imageUrl }
    });
  } catch (error) {
    console.error("Upload CEO Image Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update CEO Content (Admin)
export async function updateCeoContent(req, res) {
  try {
    const {
      ceo_name,
      ceo_title,
      ceo_message,
      social_links
    } = req.body;

    const [existing] = await query(`SELECT id FROM ceo_content LIMIT 1`);

    if (existing) {
      await query(`
        UPDATE ceo_content SET
          ceo_name = COALESCE(?, ceo_name),
          ceo_title = COALESCE(?, ceo_title),
          ceo_message = COALESCE(?, ceo_message),
          social_links = COALESCE(?, social_links),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        ceo_name, ceo_title, ceo_message,
        social_links ? JSON.stringify(social_links) : null,
        existing.id
      ]);
    } else {
      await query(`
        INSERT INTO ceo_content (ceo_name, ceo_title, ceo_message, social_links)
        VALUES (?, ?, ?, ?)
      `, [
        ceo_name || 'Anupam Mittal',
        ceo_title || 'Founder, Vivaaha.com',
        ceo_message,
        social_links ? JSON.stringify(social_links) : null
      ]);
    }

    res.json({ success: true, message: "CEO content updated successfully" });
  } catch (error) {
    console.error("Update CEO Content Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update CEO Content Public (No Auth)
export async function updateCeoContentPublic(req, res) {
  try {
    const {
      ceo_name,
      ceo_title,
      ceo_message,
      social_links
    } = req.body;

    const [existing] = await query(`SELECT id FROM ceo_content LIMIT 1`);

    if (existing) {
      await query(`
        UPDATE ceo_content SET
          ceo_name = COALESCE(?, ceo_name),
          ceo_title = COALESCE(?, ceo_title),
          ceo_message = COALESCE(?, ceo_message),
          social_links = COALESCE(?, social_links),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        ceo_name, ceo_title, ceo_message,
        social_links ? JSON.stringify(social_links) : null,
        existing.id
      ]);
    } else {
      await query(`
        INSERT INTO ceo_content (ceo_name, ceo_title, ceo_message, social_links)
        VALUES (?, ?, ?, ?)
      `, [
        ceo_name || 'Anupam Mittal',
        ceo_title || 'Founder, Vivaaha.com',
        ceo_message,
        social_links ? JSON.stringify(social_links) : null
      ]);
    }

    res.json({ success: true, message: "CEO content updated successfully" });
  } catch (error) {
    console.error("Update CEO Content Public Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get CEO Content (Public)
export async function getCeoContent(req, res) {
  try {
    const [ceoContent] = await query(`
      SELECT * FROM ceo_content ORDER BY id DESC LIMIT 1
    `);

    res.json({
      success: true,
      data: ceoContent || {}
    });
  } catch (error) {
    console.error("Get CEO Content Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}