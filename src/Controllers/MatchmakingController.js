"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoroscopeCompatibility = getHoroscopeCompatibility;
exports.getAshtakootScore = getAshtakootScore;
const utils = require("util");
const axios_1 = require("axios");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const ASTRO_API_KEY = process.env.ASTRO_API_KEY;
const ASTRO_API_URL = process.env.ASTRO_API_URL;
async function getHoroscopeCompatibility(req, res) {
    var _a;
    try {
        const { girl, boy } = req.body;
        if (!girl || !boy) {
            return res.status(400).json({
                success: false,
                message: "Both girl and boy details are required"
            });
        }
        // Validate required fields
        const requiredFields = ['name', 'date_of_birth', 'time_of_birth', 'place_of_birth', 'city_of_birth'];
        for (const field of requiredFields) {
            if (!girl[field] || !boy[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field} is required for both girl and boy`
                });
            }
        }
        // Helper function to extract astro data from input
        const extractAstroData = (person) => {
            const birthDate = new Date(person.date_of_birth);
            const birthTime = person.time_of_birth.split(':');
            return {
                year: birthDate.getFullYear(),
                month: birthDate.getMonth() + 1,
                date: birthDate.getDate(),
                hours: parseInt(birthTime[0]) || 0,
                minutes: parseInt(birthTime[1]) || 0,
                seconds: parseInt(birthTime[2]) || 0,
                latitude: parseFloat(person.latitude) || 0,
                longitude: parseFloat(person.longitude) || 0,
                timezone: 5.5
            };
        };
        const femaleData = extractAstroData(girl);
        const maleData = extractAstroData(boy);
        // Get scores for all three languages
        const languages = [
            { code: "en", name: "english" },
            { code: "te", name: "telugu" },
            { code: "hi", name: "hindi" }
        ];
        const results = {};
        for (const lang of languages) {
            const requestData = {
                female: femaleData,
                male: maleData,
                config: {
                    observation_point: "topocentric",
                    language: lang.code,
                    ayanamsha: "lahiri"
                }
            };
            try {
                const response = await axios_1.default.post(`${ASTRO_API_URL}/match-making/ashtakoot-score`, requestData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': ASTRO_API_KEY
                    }
                });
                results[lang.name] = response.data;
            }
            catch (apiError) {
                console.error(`API Error for ${lang.name}:`, ((_a = apiError.response) === null || _a === void 0 ? void 0 : _a.data) || apiError.message);
                results[lang.name] = {
                    statusCode: 500,
                    error: "Failed to get ashtakoot score"
                };
            }
        }
        res.json({
            success: true,
            message: "Horoscope compatibility calculated successfully",
            data: {
                girl_name: girl.name,
                boy_name: boy.name,
                compatibility_score: results
            }
        });
    }
    catch (error) {
        console.error("Horoscope Compatibility Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
}
async function getAshtakootScore(req, res) {
    var _a;
    try {
        const userId = req.user.user_id;
        const { match_profile_id } = req.body;
        if (!match_profile_id) {
            return res.status(400).json({
                success: false,
                message: "Match profile ID is required"
            });
        }
        // Get current user's details
        const [userDetails] = await query(`SELECT 
         up.date_of_birth, up.gender_id,
         ad.birth_time,
         ld.latitude, ld.longitude
       FROM user_profiles up 
       LEFT JOIN astro_details ad ON up.user_id = ad.user_id
       LEFT JOIN location_details ld ON up.user_id = ld.user_id
       WHERE up.user_id = ?`, [userId]);
        if (!userDetails) {
            return res.status(400).json({
                success: false,
                message: "Your profile details not found. Please complete your profile."
            });
        }
        // Get match profile's details
        const [matchDetails] = await query(`SELECT 
         up.date_of_birth, up.gender_id,
         ad.birth_time,
         ld.latitude, ld.longitude
       FROM user_profiles up 
       LEFT JOIN astro_details ad ON up.user_id = ad.user_id
       LEFT JOIN location_details ld ON up.user_id = ld.user_id
       WHERE up.user_id = ?`, [match_profile_id]);
        if (!matchDetails) {
            return res.status(400).json({
                success: false,
                message: "Match profile details not found"
            });
        }
        // Helper function to extract date and time components
        const extractAstroData = (details) => {
            const birthDate = new Date(details.date_of_birth);
            const birthTime = details.birth_time ? details.birth_time.split(':') : ['0', '0', '0'];
            return {
                year: birthDate.getFullYear(),
                month: birthDate.getMonth() + 1, // getMonth() returns 0-11, need 1-12
                date: birthDate.getDate(),
                hours: parseInt(birthTime[0]) || 0,
                minutes: parseInt(birthTime[1]) || 0,
                seconds: parseInt(birthTime[2]) || 0,
                latitude: parseFloat(details.latitude) || 0,
                longitude: parseFloat(details.longitude) || 0,
                timezone: 5.5 // Default timezone
            };
        };
        // Determine male and female based on gender
        let maleData, femaleData;
        if (userDetails.gender_id === 1) { // Assuming 1 is male
            maleData = extractAstroData(userDetails);
            femaleData = extractAstroData(matchDetails);
        }
        else {
            femaleData = extractAstroData(userDetails);
            maleData = extractAstroData(matchDetails);
        }
        // Get scores for all three languages
        const languages = [
            { code: "en", name: "english" },
            { code: "te", name: "telugu" },
            { code: "hi", name: "hindi" }
        ];
        const results = {};
        for (const lang of languages) {
            const requestData = {
                female: femaleData,
                male: maleData,
                config: {
                    observation_point: "topocentric",
                    language: lang.code,
                    ayanamsha: "lahiri"
                }
            };
            try {
                const response = await axios_1.default.post(`${ASTRO_API_URL}/match-making/ashtakoot-score`, requestData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': ASTRO_API_KEY
                    }
                });
                results[lang.name] = response.data;
            }
            catch (apiError) {
                console.error(`API Error for ${lang.name}:`, ((_a = apiError.response) === null || _a === void 0 ? void 0 : _a.data) || apiError.message);
                results[lang.name] = {
                    statusCode: 500,
                    error: "Failed to get ashtakoot score"
                };
            }
        }
        res.json({
            success: true,
            message: "Ashtakoot scores retrieved successfully",
            data: results
        });
    }
    catch (error) {
        console.error("Matchmaking Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
}
//# sourceMappingURL=MatchmakingController.js.map