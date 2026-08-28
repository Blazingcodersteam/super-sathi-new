import * as utils from "util";
import * as jwt from "jsonwebtoken";
import crypto from "crypto";
import { encodeBase64, tryParseJSON } from "./Helper";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const dotenv = require("dotenv");
const FormData = require("form-data");
const JWT_SECRET = process.env.JWT_SECRET_KEY;


export async function createTicketAttendeeGuestLatest(req, res) {
  try {
    const user_id = req.user.user_id;
    const { event_id, ticket_group_id, attendee_details, guest_details } =
      req.body;

    const created_at = new Date();
    const ticketGroup = ticket_group_id || `TG-${Date.now()}`;

    // Check for duplicate ticket name
    const [existing] = await query(
      `SELECT * FROM tickets WHERE event_id = ? AND user_id = ? AND ticket_name = ?`,
      [event_id, user_id, attendee_details.ticket_name]
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Ticket name "${attendee_details.ticket_name}" already exists.`,
      });
    }

    // Build ticket values
    const ticketValues = [
      user_id,
      event_id,
      attendee_details.ticket_name,
      attendee_details.description || null,
      attendee_details.price || null,
      attendee_details.quantity || 0,
      attendee_details.start_sale,
      attendee_details.end_sale,
      ticketGroup,
      attendee_details.ticket_type || "paid",
      attendee_details.currency || "USD",
      attendee_details.pricing_option || "fixed",
      attendee_details.tax_type || null,
      attendee_details.selected_form || null,
      attendee_details.form_details || null,
      attendee_details.schedule_sale || null,
      attendee_details.schedule_sale_enabled || "no",
      attendee_details.private_ticket === true ? "yes" : "no",
      attendee_details.ticket_min_order || 1,
      attendee_details.ticket_max_order || null,
      attendee_details.show_promational_label === true ? "yes" : "no",
      attendee_details.promational_label_text || null,
      attendee_details.qrcode || null,
      attendee_details.ticket_status || "onsale",
      created_at,
      ticketGroup,
      attendee_details.variable_prices
        ? JSON.stringify(attendee_details.variable_prices)
        : null,
      attendee_details.tax_options
        ? JSON.stringify(attendee_details.tax_options)
        : null,
      attendee_details.tax_registration_no || null,
      attendee_details.addons ? JSON.stringify(attendee_details.addons) : null,
      attendee_details.onsale_status || "enable",
      guest_details ? JSON.stringify(guest_details) : null,
    ];

    // Insert ticket
    const insertQuery = `
      INSERT INTO tickets (
        user_id, event_id, ticket_name, description, price, quantity,
        start_sale, end_sale, ticket_group, ticket_type, currency,
        pricing_option, tax_type, selected_form, form_details,
        schedule_sale, schedule_sale_enabled, private_ticket,
        ticket_min_order, ticket_max_order, show_promational_label,
        promational_label_text, qrcode, ticket_status, created_at,
        ticket_group_id, variable_prices, tax_options, tax_registration_no,
        addons, onsale_status, guest_details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await query(insertQuery, ticketValues);
    const [insertedTicket] = await query(`SELECT * FROM tickets WHERE id = ?`, [
      result.insertId,
    ]);

    // Parse JSON fields
    const jsonFields = [
      "form_details",
      "variable_prices",
      "tax_options",
      "addons",
      "guest_details",
    ];

    jsonFields.forEach((key) => {
      insertedTicket[key] = tryParseJSON(insertedTicket[key]);
    });

    // Parse nested guest_details fields
    if (insertedTicket.guest_details && typeof insertedTicket.guest_details === "object") {
      const guestFields = [
        "form_details",
        "variable_prices",
        "tax_options",
        "addons",
      ];
      guestFields.forEach((key) => {
        insertedTicket.guest_details[key] = tryParseJSON(insertedTicket.guest_details[key]);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket created successfully",
      ticket: insertedTicket,
    });
  } catch (err) {
    console.error("Create Ticket Error:", err);
    return res.status(500).json({
      success: false,
      message: "An error occurred while creating the ticket",
    });
  }
}
