"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const OTPController_1 = require("../Controllers/OTPController");
const router = express.Router();
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
router.get("/", (req, res) => {
    res.status(200).send("Supersathi API Code");
});
// Super admin route moved to admin routes
// Route to create team member (authenticated super admin only)
router.post("/send_otp_mail", (req, res) => {
    (0, OTPController_1.sendOtp)(req, res);
});
router.post("/verify_mail_otp", (req, res) => {
    (0, OTPController_1.verifyOtp)(req, res);
});
router.post("/send_otp_phone", (req, res) => {
    (0, OTPController_1.sendOtp)(req, res);
});
router.post("/verify_phone_otp", (req, res) => {
    (0, OTPController_1.verifyOtp)(req, res);
});
//Events
// router.post(
//   "/create_event",
//   verifyToken,
//   // FileUploader("your-s3-bucket-name", "event_logos/").single("event_logo"),
//   LocalFileUploader("local_uploads/").single("event_logo"),
//   createEvent
// );
// router.post("/update_event_pages_by_id", verifyToken, updateEventPageById);
// Tickets
// router.post("/create_ticket", verifyToken, createTicket);
// router.post("/create_ticket_new", verifyToken, createTicketAttendeeGuest);
// router.post(
//   "/create_ticket_latest",
//   verifyToken,
//   createTicketAttendeeGuestLatest
// );
//Formbuliders
// router.post("/create_forms", verifyToken, createFormBuilder);
// router.post("/update_forms", verifyToken, updateFormBuilder);
// router.post("/get_forms_by_event_id", verifyToken, getFormBuilderByEvent);
// router.post("/get_forms_by_user", verifyToken, getFormBuilderByUser);
// File uploads
// router.post("/upload_files", verifyToken, uploadFilesToServer);
// Common
// router.get("/get_countries", verifyToken, getCountryList);
// router.get("/get_currency", verifyToken, getCurrencyList);
// router.get("/get_states", verifyToken, getStateList);
// router.post("/get_states_by_country_id", verifyToken, getStateListByCountryID);
// Chat routes moved to dedicated /api/chat in app.ts
// Match routes
const matchRoutes_1 = require("./matchRoutes");
router.use("/matches", matchRoutes_1.default);
// Inbox routes
const inboxRoutes_1 = require("./inboxRoutes");
router.use("/inbox", inboxRoutes_1.default);
// Notification routes
const notificationRoutes_1 = require("./notificationRoutes");
router.use("/notifications", notificationRoutes_1.default);
module.exports = router;
//# sourceMappingURL=route.js.map