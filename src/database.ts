require("dotenv").config();
const mysql = require("mysql2");

let pool: any = null;
let isRecreating = false;

function createPoolInstance(): any {
  if (pool) {
    try {
      pool.end((err: any) => {
        if (err) {
          console.error("Error closing previous database pool:", err.message || err);
        }
      });
    } catch (e: any) {
      console.error("Exception closing previous database pool:", e.message || e);
    }
  }

  const newPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  newPool.on("connection", (connection: any) => {
    console.log("Database connected as id", connection.threadId);
  });

  newPool.on("error", (err: any) => {
    console.error("Database pool error:", err.message || err);
    if (
      err.code === "PROTOCOL_CONNECTION_LOST" ||
      err.code === "ECONNRESET" ||
      err.code === "ETIMEDOUT" ||
      err.code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR"
    ) {
      if (!isRecreating) {
        isRecreating = true;
        console.log("Recreating database pool due to connection error...");
        setTimeout(() => {
          try {
            createPoolInstance();
          } catch (recreateErr) {
            console.error("Failed to recreate database pool:", recreateErr);
          } finally {
            isRecreating = false;
          }
        }, 1000);
      }
    }
  });

  pool = newPool;
  console.log("Database pool created successfully");
  return pool;
}

function getActivePool(): any {
  if (!pool) {
    createPoolInstance();
  }
  return pool;
}

try {
  createPoolInstance();
} catch (error) {
  console.error("Failed to create database pool:", error);
  process.exit(1);
}

// Proxy wrapper ensures any module importing `db` always dispatches to the current active pool
const dbProxy = new Proxy(
  {},
  {
    get(target, prop, receiver) {
      const activePool = getActivePool();
      const val = activePool[prop];
      if (typeof val === "function") {
        return val.bind(activePool);
      }
      return val;
    },
    set(target, prop, value, receiver) {
      const activePool = getActivePool();
      activePool[prop] = value;
      return true;
    },
    has(target, prop) {
      const activePool = getActivePool();
      return prop in activePool;
    },
    getOwnPropertyDescriptor(target, prop) {
      const activePool = getActivePool();
      return Object.getOwnPropertyDescriptor(activePool, prop);
    },
    ownKeys(target) {
      const activePool = getActivePool();
      return Reflect.ownKeys(activePool);
    },
  }
);

module.exports = dbProxy;
