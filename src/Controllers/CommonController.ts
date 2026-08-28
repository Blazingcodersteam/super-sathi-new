import * as utils from "util";
import * as jwt from "jsonwebtoken";
import crypto from "crypto";
import { encodeBase64 } from "./Helper";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const dotenv = require("dotenv");
const FormData = require("form-data");
const JWT_SECRET = process.env.JWT_SECRET_KEY;

export async function getCountryList(req, res) {
  try {
    const countries = await query("SELECT * FROM countries");

    return res.status(200).json({
      success: true,
      countries,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
}
export async function getCurrencyList(req, res) {
  try {
    const countries = await query("SELECT * FROM tbl_currency_list");

    return res.status(200).json({
      success: true,
      countries,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
}
export async function getStateList(req, res) {
  try {
    const states = await query("SELECT * FROM states");
    return res.status(200).json({
      success: true,
      states,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
}
export async function getStateListByCountryID(req, res) {
  try {
    const { country_id } = req.body;

    if (!country_id || isNaN(country_id)) {
      return res.status(400).json({
        success: false,
        message: "Valid country_id is required",
      });
    }

    const [country] = await query("SELECT id FROM countries WHERE id = ?", [
      country_id,
    ]);

    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Country not found",
      });
    }

    const states_list = await query(
      `SELECT * FROM states WHERE country_id = ?`,
      [country_id]
    );

    return res.status(200).json({
      success: true,
      states_list,
    });
  } catch (err) {
    console.error("getStateListByCountryID Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: err.message,
    });
  }
}
