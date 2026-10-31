import mysql from "mysql2/promise";
import { config } from "./config";

export const pool = mysql.createPool({
  ...config.mysql,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
});
