"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translations = exports.languageMaster = void 0;
const utils = require("util");
const https = require("https");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Helper: get active language codes from language_master
async function getLanguageCodes() {
    const langs = await query("SELECT language_code FROM language_master WHERE is_active = 1 ORDER BY id ASC");
    return langs.map((l) => l.language_code);
}
// Helper: get all languages with details
async function getAllLanguages() {
    const langs = await query("SELECT id, language_name, language_code, is_active FROM language_master ORDER BY id ASC");
    return langs;
}
// Helper: translate text using MyMemory free API (no key needed)
// Decode HTML entities like &amp; &#39; &quot; etc from API response
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}
// Reject only actual encoding garbage (latin chars replacing unicode)
function isValidTranslation(translated) {
    if (!translated || translated.trim() === '')
        return false;
    // Reject mojibake — sequences of latin chars that replaced unicode bytes
    if (/[\u00c0-\u00ff]{3,}/.test(translated))
        return false;
    return true;
}
function translateText(text, targetLang) {
    return new Promise((resolve) => {
        const encoded = encodeURIComponent(text);
        const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|${targetLang}`;
        https.get(url, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                var _a;
                try {
                    const json = JSON.parse(data);
                    const raw = (_a = json === null || json === void 0 ? void 0 : json.responseData) === null || _a === void 0 ? void 0 : _a.translatedText;
                    if (!raw)
                        return resolve(null);
                    const translated = decodeHtmlEntities(raw);
                    resolve(isValidTranslation(translated) ? translated : null);
                }
                catch (_b) {
                    resolve(null);
                }
            });
        }).on("error", () => resolve(null));
    });
}
// ============ LANGUAGE MASTER ============
exports.languageMaster = {
    async getAll(req, res) {
        try {
            const languages = await query("SELECT * FROM language_master ORDER BY id ASC");
            res.json({ success: true, data: languages });
        }
        catch (error) {
            console.error("Get Languages Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    async create(req, res) {
        try {
            const { language_name, language_code, is_active = 1 } = req.body;
            if (!language_name || !language_code) {
                return res.status(400).json({
                    success: false,
                    message: "language_name and language_code are required",
                });
            }
            const code = language_code.toLowerCase();
            const [existing] = await query("SELECT id FROM language_master WHERE language_code = ?", [code]);
            if (existing) {
                return res.status(400).json({ success: false, message: "Language code already exists" });
            }
            // Add language to master
            await query("INSERT INTO language_master (language_name, language_code, is_active) VALUES (?, ?, ?)", [language_name, code, is_active]);
            // Dynamically add column to translations table if not exists
            await query(`ALTER TABLE translations ADD COLUMN IF NOT EXISTS \`${code}\` text DEFAULT NULL`);
            res.status(201).json({
                success: true,
                message: `Language '${language_name}' added successfully. Column '${code}' added to translations table.`,
            });
        }
        catch (error) {
            console.error("Create Language Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    async update(req, res) {
        try {
            const { id } = req.params;
            const { language_name, is_active } = req.body;
            const [existing] = await query("SELECT id FROM language_master WHERE id = ?", [id]);
            if (!existing) {
                return res.status(404).json({ success: false, message: "Language not found" });
            }
            const updates = [];
            const values = [];
            if (language_name !== undefined) {
                updates.push("language_name = ?");
                values.push(language_name);
            }
            if (is_active !== undefined) {
                updates.push("is_active = ?");
                values.push(is_active);
            }
            if (updates.length === 0) {
                return res.status(400).json({ success: false, message: "No fields to update" });
            }
            values.push(id);
            await query(`UPDATE language_master SET ${updates.join(", ")} WHERE id = ?`, values);
            res.json({ success: true, message: "Language updated successfully" });
        }
        catch (error) {
            console.error("Update Language Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    async delete(req, res) {
        try {
            const { id } = req.params;
            const [existing] = await query("SELECT id FROM language_master WHERE id = ? AND is_active = 1", [id]);
            if (!existing) {
                return res.status(404).json({ success: false, message: "Language not found" });
            }
            await query("UPDATE language_master SET is_active = 0 WHERE id = ?", [id]);
            res.json({ success: true, message: "Language deleted successfully" });
        }
        catch (error) {
            console.error("Delete Language Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
};
// ============ TRANSLATIONS ============
exports.translations = {
    // GET /admin/translations?page=1&limit=10&search=&platform=&status=
    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, search = "", platform, status } = req.query;
            const offset = (Number(page) - 1) * Number(limit);
            let where = "WHERE 1=1";
            const params = [];
            if (search) {
                where += " AND (text_key LIKE ? OR actual_text LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }
            if (platform) {
                where += " AND (platform = ? OR platform = 'both')";
                params.push(platform);
            }
            if (status !== undefined && status !== "") {
                where += " AND status = ?";
                params.push(status);
            }
            const rows = await query(`SELECT id, text_key, actual_text, platform, status, language_data, auto_converted, created_at, updated_at FROM translations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
            const [{ total }] = await query(`SELECT COUNT(*) as total FROM translations ${where}`, params);
            // Get all languages for response metadata
            const languages = await getAllLanguages();
            // Parse language_data JSON for each row
            const processedRows = rows.map(row => {
                let languageData = {};
                if (row.language_data) {
                    try {
                        // If it's already an object, use it directly; if it's a string, parse it
                        languageData = typeof row.language_data === 'string'
                            ? JSON.parse(row.language_data)
                            : row.language_data;
                    }
                    catch (e) {
                        console.error('Error parsing language_data for row:', row.id, e);
                        languageData = {};
                    }
                }
                return Object.assign(Object.assign({}, row), { language_data: languageData });
            });
            res.json({
                success: true,
                data: processedRows,
                languages,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit)),
                },
            });
        }
        catch (error) {
            console.error("Get Translations Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // GET /admin/translations/:id
    async getById(req, res) {
        try {
            const { id } = req.params;
            const [row] = await query("SELECT id, text_key, actual_text, platform, status, language_data, auto_converted, created_at, updated_at FROM translations WHERE id = ? AND status = 1", [id]);
            if (!row) {
                return res.status(404).json({ success: false, message: "Translation not found" });
            }
            // Parse language_data JSON
            let languageData = {};
            if (row.language_data) {
                try {
                    languageData = typeof row.language_data === 'string'
                        ? JSON.parse(row.language_data)
                        : row.language_data;
                }
                catch (e) {
                    console.error('Error parsing language_data for row:', row.id, e);
                    languageData = {};
                }
            }
            const processedRow = Object.assign(Object.assign({}, row), { language_data: languageData });
            // Get all languages for reference
            const languages = await getAllLanguages();
            res.json({
                success: true,
                data: processedRow,
                languages
            });
        }
        catch (error) {
            console.error("Get Translation Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // GET /admin/translations/key/:text_key?platform=web
    async getByKey(req, res) {
        try {
            const { text_key } = req.params;
            const { platform } = req.query;
            let where = "WHERE text_key = ? AND status = 1";
            const params = [text_key];
            if (platform) {
                where += " AND (platform = ? OR platform = 'both')";
                params.push(platform);
            }
            const [row] = await query(`SELECT id, text_key, actual_text, platform, status, language_data, auto_converted, created_at, updated_at FROM translations ${where} LIMIT 1`, params);
            if (!row) {
                return res.status(404).json({ success: false, message: "Translation key not found" });
            }
            // Parse language_data JSON
            let languageData = {};
            if (row.language_data) {
                try {
                    languageData = typeof row.language_data === 'string'
                        ? JSON.parse(row.language_data)
                        : row.language_data;
                }
                catch (e) {
                    console.error('Error parsing language_data for row:', row.id, e);
                    languageData = {};
                }
            }
            const processedRow = Object.assign(Object.assign({}, row), { language_data: languageData });
            res.json({ success: true, data: processedRow });
        }
        catch (error) {
            console.error("Get Translation By Key Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // POST /admin/translations
    // Body: { text_key, actual_text, platform, status, auto_conversion, en, ta, te, ml, hi, ...any language code }
    async create(req, res) {
        try {
            const _a = req.body, { text_key, actual_text, platform = "both", status = 1, auto_conversion = false } = _a, langValues = __rest(_a, ["text_key", "actual_text", "platform", "status", "auto_conversion"]);
            if (!text_key || !actual_text) {
                return res.status(400).json({
                    success: false,
                    message: "text_key and actual_text are required",
                });
            }
            // Check if text_key already exists (for update scenario)
            const [existing] = await query("SELECT id, language_data FROM translations WHERE text_key = ?", [text_key]);
            // Get all active language codes from language_master
            const langCodes = await getLanguageCodes();
            const languageData = {};
            if (auto_conversion) {
                // Use actual_text or provided 'en' as English source
                const enText = langValues['en'] || actual_text;
                languageData['en'] = enText;
                console.log(`Auto-converting text: "${enText}" to ${langCodes.length} languages`);
                // Translate to all other active languages (skip 'en')
                for (const code of langCodes) {
                    if (code === 'en')
                        continue;
                    try {
                        const translated = await translateText(enText, code);
                        languageData[code] = translated;
                        console.log(`Translated to ${code}: ${translated}`);
                    }
                    catch (error) {
                        console.error(`Translation failed for ${code}:`, error);
                        languageData[code] = null;
                    }
                }
            }
            else {
                // Manual mode: Use provided values, set missing active languages to null
                for (const code of langCodes) {
                    if (langValues[code] !== undefined) {
                        languageData[code] = langValues[code];
                    }
                    else {
                        // For missing languages, keep existing value if updating, or set to null if creating
                        if (existing && existing.language_data) {
                            try {
                                const existingData = JSON.parse(existing.language_data);
                                languageData[code] = existingData[code] || null;
                            }
                            catch (e) {
                                languageData[code] = null;
                            }
                        }
                        else {
                            languageData[code] = null;
                        }
                    }
                }
            }
            if (existing) {
                // Update existing translation with latest language list
                console.log(`Updating existing translation for text_key: ${text_key}`);
                await query(`UPDATE translations SET actual_text = ?, platform = ?, status = ?, language_data = ?, auto_converted = ?, updated_at = NOW() WHERE text_key = ?`, [actual_text, platform, status, JSON.stringify(languageData), auto_conversion ? 1 : 0, text_key]);
                res.json({
                    success: true,
                    message: auto_conversion
                        ? `Translation '${text_key}' updated with auto-conversion for ${langCodes.length} languages successfully`
                        : `Translation '${text_key}' updated successfully`,
                    id: existing.id,
                    language_data: languageData,
                    auto_converted: auto_conversion,
                    languages_count: langCodes.length,
                    action: 'updated'
                });
            }
            else {
                // Create new translation
                console.log(`Creating new translation for text_key: ${text_key}`);
                const result = await query(`INSERT INTO translations (text_key, actual_text, platform, status, language_data, auto_converted) VALUES (?, ?, ?, ?, ?, ?)`, [text_key, actual_text, platform, status, JSON.stringify(languageData), auto_conversion ? 1 : 0]);
                res.status(201).json({
                    success: true,
                    message: auto_conversion
                        ? `Translation '${text_key}' created with auto-conversion for ${langCodes.length} languages successfully`
                        : `Translation '${text_key}' created successfully`,
                    id: result.insertId,
                    language_data: languageData,
                    auto_converted: auto_conversion,
                    languages_count: langCodes.length,
                    action: 'created'
                });
            }
        }
        catch (error) {
            console.error("Create Translation Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // PUT /admin/translations/:id
    // Body: { actual_text, platform, status, text_key, auto_conversion, en, ta, te, ml, hi, ...any language code }
    async update(req, res) {
        try {
            const { id } = req.params;
            const _a = req.body, { actual_text, platform, status, text_key, auto_conversion = false } = _a, langValues = __rest(_a, ["actual_text", "platform", "status", "text_key", "auto_conversion"]);
            const [existing] = await query("SELECT id, language_data, actual_text, text_key FROM translations WHERE id = ?", [id]);
            if (!existing) {
                return res.status(404).json({ success: false, message: "Translation not found" });
            }
            // Get all active language codes from language_master
            const langCodes = await getLanguageCodes();
            const updates = [];
            const values = [];
            // Handle basic field updates
            if (text_key !== undefined) {
                updates.push("text_key = ?");
                values.push(text_key);
            }
            if (actual_text !== undefined) {
                updates.push("actual_text = ?");
                values.push(actual_text);
            }
            if (platform !== undefined) {
                updates.push("platform = ?");
                values.push(platform);
            }
            if (status !== undefined) {
                updates.push("status = ?");
                values.push(status);
            }
            // Handle language data with latest language list
            let languageData = {};
            // Parse existing language data
            if (existing.language_data) {
                try {
                    languageData = JSON.parse(existing.language_data);
                }
                catch (e) {
                    languageData = {};
                }
            }
            if (auto_conversion) {
                // Use en from body, or existing en, or actual_text as source
                const enText = langValues['en'] || languageData['en'] || actual_text || existing['actual_text'];
                languageData['en'] = enText;
                console.log(`Auto-converting text: "${enText}" to ${langCodes.length} languages for update`);
                // Translate to all active languages based on current language_master
                for (const code of langCodes) {
                    if (code === 'en')
                        continue;
                    try {
                        const translated = await translateText(enText, code);
                        languageData[code] = translated;
                        console.log(`Updated translation for ${code}: ${translated}`);
                    }
                    catch (error) {
                        console.error(`Translation failed for ${code}:`, error);
                        // Keep existing translation if new translation fails
                        if (!languageData[code]) {
                            languageData[code] = null;
                        }
                    }
                }
                updates.push("auto_converted = ?");
                values.push(1);
            }
            else {
                // Manual update - merge with existing data for active languages
                for (const code of langCodes) {
                    if (langValues[code] !== undefined) {
                        languageData[code] = langValues[code];
                    }
                    else if (!languageData[code]) {
                        // Initialize with null if not exists for active language
                        languageData[code] = null;
                    }
                }
                updates.push("auto_converted = ?");
                values.push(0);
            }
            // Always update language_data with current language list
            updates.push("language_data = ?");
            values.push(JSON.stringify(languageData));
            updates.push("updated_at = NOW()");
            if (updates.length === 0) {
                return res.status(400).json({ success: false, message: "No fields to update" });
            }
            values.push(id);
            await query(`UPDATE translations SET ${updates.join(", ")} WHERE id = ?`, values);
            // Return updated row
            const [updated] = await query("SELECT id, text_key, actual_text, platform, status, language_data, auto_converted, created_at, updated_at FROM translations WHERE id = ?", [id]);
            const processedRow = Object.assign(Object.assign({}, updated), { language_data: (() => {
                    if (!updated.language_data)
                        return {};
                    try {
                        return typeof updated.language_data === 'string'
                            ? JSON.parse(updated.language_data)
                            : updated.language_data;
                    }
                    catch (e) {
                        console.error('Error parsing language_data for updated row:', updated.id, e);
                        return {};
                    }
                })() });
            res.json({
                success: true,
                message: auto_conversion
                    ? "Translation updated with auto-conversion successfully"
                    : "Translation updated successfully",
                data: processedRow,
                languages_updated: langCodes.length
            });
        }
        catch (error) {
            console.error("Update Translation Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // PUT /admin/translations/:id/status — update only status (active/inactive)
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            if (status === undefined || (status !== 0 && status !== 1)) {
                return res.status(400).json({
                    success: false,
                    message: "status is required and must be 0 (inactive) or 1 (active)"
                });
            }
            const [existing] = await query("SELECT id FROM translations WHERE id = ?", [id]);
            if (!existing) {
                return res.status(404).json({ success: false, message: "Translation not found" });
            }
            await query("UPDATE translations SET status = ? WHERE id = ?", [status, id]);
            res.json({
                success: true,
                message: `Translation ${status === 1 ? 'activated' : 'deactivated'} successfully`
            });
        }
        catch (error) {
            console.error("Update Translation Status Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // DELETE /admin/translations/:id — soft delete
    async delete(req, res) {
        try {
            const { id } = req.params;
            const [existing] = await query("SELECT id FROM translations WHERE id = ?", [id]);
            if (!existing) {
                return res.status(404).json({ success: false, message: "Translation not found" });
            }
            await query("UPDATE translations SET status = 0 WHERE id = ?", [id]);
            res.json({ success: true, message: "Translation deactivated successfully" });
        }
        catch (error) {
            console.error("Delete Translation Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // GET /admin/translations/export?platform=web&lang=ta
    // Returns flat key-value map for a specific language — used by frontend/app
    async exportByLanguage(req, res) {
        try {
            const { platform, lang = "en" } = req.query;
            if (!lang) {
                return res.status(400).json({ success: false, message: "lang is required" });
            }
            // Validate lang code exists
            const [langExists] = await query("SELECT id FROM language_master WHERE language_code = ? AND is_active = 1", [lang]);
            if (!langExists) {
                return res.status(400).json({ success: false, message: "Invalid or inactive language code" });
            }
            const params = [lang];
            if (platform) {
                params.push(platform);
            }
            const rows = await query(`SELECT text_key, language_data FROM translations WHERE status = 1 AND (platform = ? OR platform = 'both') ORDER BY text_key ASC`, [lang, platform]);
            // Build flat key-value object — extract specific language from JSON
            const result = {};
            rows.forEach((row) => {
                let languageData = {};
                try {
                    if (row.language_data) {
                        languageData = typeof row.language_data === 'string'
                            ? JSON.parse(row.language_data)
                            : row.language_data;
                    }
                }
                catch (e) {
                    console.error('Error parsing language_data for export row:', row.text_key, e);
                    languageData = {};
                }
                // Get translation for requested language, fallback to English, then to text_key
                const translation = languageData[lang] || languageData['en'] || row.text_key;
                result[row.text_key] = translation;
            });
            res.json({
                success: true,
                language: lang,
                platform: platform || "all",
                data: result
            });
        }
        catch (error) {
            console.error("Export Translations Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
};
//# sourceMappingURL=TranslationController.js.map