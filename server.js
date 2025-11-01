import express from "express";
import multer from "multer";
import mysql from "mysql2";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ MySQL Pool (Clever Cloud)
const db = mysql.createPool({
  connectionLimit: 10,
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: process.env.MYSQL_ADDON_PORT,
  connectTimeout: 10000,
  waitForConnections: true,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) console.error("❌ Database connection failed:", err.message);
  else {
    console.log("✅ Connected to MySQL Database!");
    connection.release();
  }
});

// ✅ Auto-create tables
db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    bio TEXT,
    image VARCHAR(255),
    gender VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`, err => {
  if (err) console.error('❌ Error creating users table:', err);
  else console.log('✅ Users table ready.');
});

db.query(`
  CREATE TABLE IF NOT EXISTS likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    liker_email VARCHAR(100) NOT NULL,
    liked_email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`, err => {
  if (err) console.error('❌ Error creating likes table:', err);
  else console.log('✅ Likes table ready.');
});

// ✅ Multer setup
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ✅ Upload route
app.post("/upload", upload.single("image"), (req, res) => {
  const { name, email, bio, gender } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!name || !email) return res.status(400).send("Missing required fields");

  const checkSql = "SELECT * FROM users WHERE email = ?";
  db.query(checkSql, [email], (err, results) => {
    if (err) return res.status(500).send("Database error");

    if (results.length > 0) {
      return res.status(200).json({ message: "User already exists", user: results[0] });
    }

    const sql = "INSERT INTO users (name, email, bio, image, gender) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [name, email, bio, image, gender], (err, result) => {
      if (err) return res.status(500).send("Database error");

      console.log("✅ New profile created:", result);
      res.status(201).json({ message: "Profile created successfully", user: { name, email, bio, image, gender } });
    });
  });
});

// ✅ Fetch users (opposite gender)
app.get("/users", (req, res) => {
  const currentUserEmail = req.query.email;

  const genderQuery = "SELECT gender FROM users WHERE email = ?";
  db.query(genderQuery, [currentUserEmail], (err, genderResult) => {
    if (err || genderResult.length === 0)
      return res.status(500).json({ error: "Error finding user gender" });

    const userGender = genderResult[0].gender;
    const oppositeGender = userGender === "male" ? "female" : "male";

    const sql = "SELECT * FROM users WHERE gender = ?";
    db.query(sql, [oppositeGender], (err, results) => {
      if (err) return res.status(500).json({ error: "Failed to load users from database." });
      res.json(results);
    });
  });
});

// ✅ Like route
app.post("/like", (req, res) => {
  const { liker_email, liked_email } = req.body;
  if (!liker_email || !liked_email) return res.status(400).send("Missing liker or liked email");

  const sql = "INSERT INTO likes (liker_email, liked_email) VALUES (?, ?)";
  db.query(sql, [liker_email, liked_email], (err, result) => {
    if (err) return res.status(500).send("Database error");
    console.log(`💖 ${liker_email} liked ${liked_email}`);
    res.send("Like saved successfully!");
  });
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
