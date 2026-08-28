import * as express from "express";
// User controller imports removed - using separate auth/user routes
import { verifyToken } from "../Controllers/Helper";

import {
  getCountryList,
  getCurrencyList,
  getStateList,
  getStateListByCountryID,
} from "../Controllers/CommonController";

import {
  createTicketAttendeeGuestLatest,

} from "../Controllers/TicketController";
import { sendOtp, verifyOtp } from "../Controllers/OTPController";




import {
  createFormBuilder,
  getFormBuilderByUser,
  getFormBuilderByEvent,
  updateFormBuilder,
} from "../Controllers/FormsBuilderController";
// import upload from "../FileHandlingControllers/FileUploader"; // or localUploader
// import { uploadFilesToServer } from "../FileHandlingControllers/FileUploader";
// import LocalFileUploader from "../FileHandlingControllers/LocalUploader";
import chatRoutes from "./chatRoutes";

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
  sendOtp(req, res);
});
router.post("/verify_mail_otp", (req, res) => {
  verifyOtp(req, res);
});

router.post("/send_otp_phone", (req, res) => {
  sendOtp(req, res);
});
router.post("/verify_phone_otp", (req, res) => {
  verifyOtp(req, res);
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
import matchRoutes from "./matchRoutes";
router.use("/matches", matchRoutes);

// Inbox routes
import inboxRoutes from "./inboxRoutes";
router.use("/inbox", inboxRoutes);

// Notification routes
import notificationRoutes from "./notificationRoutes";
router.use("/notifications", notificationRoutes);

module.exports = router;
