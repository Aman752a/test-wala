const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, "data");
const fs = require("fs");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "test-wala.db"));

const JWT_SECRET =
  process.env.JWT_SECRET || "change-this-secret-in-production";

const OWNER_EMAIL =
  process.env.OWNER_EMAIL || "owner@example.com";

const OWNER_PASSWORD =
  process.env.OWNER_PASSWORD || "change-this-password";

/* =========================
   DATABASE
========================= */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  time_minutes INTEGER NOT NULL DEFAULT 10,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  topic TEXT DEFAULT 'General',
  question TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  c TEXT NOT NULL,
  d TEXT NOT NULL,
  correct TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(test_id) REFERENCES tests(id),
  FOREIGN KEY(subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  test_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(test_id) REFERENCES tests(id)
);
`);

/* =========================
   OWNER
========================= */

const ownerUser = db
  .prepare("SELECT id FROM users WHERE email = ?")
  .get(OWNER_EMAIL);

if (!ownerUser) {
  const hash = bcrypt.hashSync(OWNER_PASSWORD, 10);

  db.prepare(`
    INSERT INTO users(name,email,password,role)
    VALUES(?,?,?,'owner')
  `).run("Owner", OWNER_EMAIL, hash);
}

/* =========================
   DEFAULT SUBJECTS
========================= */

const defaultSubjects = [
  "General Knowledge",
  "History",
  "Geography",
  "Polity",
  "Science",
  "Computer"
];

const addSubject = db.prepare(
  "INSERT OR IGNORE INTO subjects(name) VALUES(?)"
);

for (const subject of defaultSubjects) {
  addSubject.run(subject);
}

/* =========================
   AUTH HELPERS
========================= */

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Login required"
      });
    }

    const token = header.substring(7);

    req.user = jwt.verify(token, JWT_SECRET);

    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired login"
    });
  }
}

function owner(req, res, next) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({
      error: "Owner access required"
    });
  }

  next();
}

/* =========================
   HEALTH
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "test-wala"
  });
});

/* =========================
   REGISTER
========================= */

app.post("/api/auth/register", (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email and password required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters"
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const exists = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(cleanEmail);

    if (exists) {
      return res.status(409).json({
        error: "Email already registered"
      });
    }

    const hash = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users(name,email,password,role)
      VALUES(?,?,?,'student')
    `).run(name.trim(), cleanEmail, hash);

    const user = db
      .prepare(`
        SELECT id,name,email,role
        FROM users
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    res.json({
      ok: true,
      token: createToken(user),
      user
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required"
      });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(String(email).trim().toLowerCase());

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const valid = bcrypt.compareSync(password, user.password);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.json({
      ok: true,
      token: createToken(safeUser),
      user: safeUser
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

/* =========================
   CURRENT USER
========================= */

app.get("/api/me", auth, (req, res) => {
  const user = db
    .prepare(`
      SELECT id,name,email,role,created_at
      FROM users
      WHERE id = ?
    `)
    .get(req.user.id);

  if (!user) {
    return res.status(404).json({
      error: "User not found"
    });
  }

  res.json(user);
});

/* =========================
   SUBJECTS - STUDENT
========================= */

app.get("/api/subjects", (req, res) => {
  const subjects = db
    .prepare(`
      SELECT id,name
      FROM subjects
      ORDER BY name
    `)
    .all();

  res.json(subjects);
});

/* =========================
   TESTS - STUDENT
========================= */

app.get("/api/tests", (req, res) => {
  const tests = db
    .prepare(`
      SELECT
        t.id,
        t.name,
        t.time_minutes,
        t.subject_id,
        s.name AS subject_name,
        COUNT(q.id) AS question_count
      FROM tests t
      LEFT JOIN subjects s
        ON s.id = t.subject_id
      LEFT JOIN questions q
        ON q.test_id = t.id
      GROUP BY t.id
      ORDER BY t.id DESC
    `)
    .all();

  res.json(tests);
});

/* =========================
   SINGLE TEST
========================= */

app.get("/api/tests/:id", auth, (req, res) => {
  const id = Number(req.params.id);

  const test = db
    .prepare(`
      SELECT
        t.id,
        t.name,
        t.time_minutes,
        t.subject_id,
        s.name AS subject_name
      FROM tests t
      LEFT JOIN subjects s
        ON s.id = t.subject_id
      WHERE t.id = ?
    `)
    .get(id);

  if (!test) {
    return res.status(404).json({
      error: "Test not found"
    });
  }

  const questions = db
    .prepare(`
      SELECT
        id,
        test_id,
        subject_id,
        topic,
        question,
        a,
        b,
        c,
        d
      FROM questions
      WHERE test_id = ?
      ORDER BY id
    `)
    .all(id);

  res.json({
    ...test,
    questions
  });
});

/* =========================
   SAVE RESULT
========================= */

app.post("/api/results", auth, (req, res) => {
  try {
    const {
      testId,
      score,
      total
    } = req.body;

    if (!testId || score === undefined || total === undefined) {
      return res.status(400).json({
        error: "Test, score and total required"
      });
    }

    const test = db
      .prepare("SELECT id FROM tests WHERE id = ?")
      .get(Number(testId));

    if (!test) {
      return res.status(404).json({
        error: "Test not found"
      });
    }

    const result = db.prepare(`
      INSERT INTO results(user_id,test_id,score,total)
      VALUES(?,?,?,?)
    `).run(
      req.user.id,
      Number(testId),
      Number(score),
      Number(total)
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

/* =========================
   MY RESULTS
========================= */

app.get("/api/my-results", auth, (req, res) => {
  const results = db
    .prepare(`
      SELECT
        r.id,
        r.test_id,
        t.name AS test_name,
        s.name AS subject_name,
        r.score,
        r.total,
        r.created_at
      FROM results r
      LEFT JOIN tests t
        ON t.id = r.test_id
      LEFT JOIN subjects s
        ON s.id = t.subject_id
      WHERE r.user_id = ?
      ORDER BY r.id DESC
    `)
    .all(req.user.id);

  res.json(results);
});

/* =========================
   ADMIN SUBJECTS
========================= */

app.get("/api/admin/subjects", auth, owner, (req, res) => {
  const subjects = db
    .prepare(`
      SELECT
        s.id,
        s.name,
        COUNT(t.id) AS test_count
      FROM subjects s
      LEFT JOIN tests t
        ON t.subject_id = s.id
      GROUP BY s.id
      ORDER BY s.name
    `)
    .all();

  res.json(subjects);
});

/* =========================
   ADD SUBJECT
========================= */

app.post("/api/admin/subjects", auth, owner, (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        error: "Subject name required"
      });
    }

    const result = db
      .prepare("INSERT INTO subjects(name) VALUES(?)")
      .run(name);

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(400).json({
      error: "Subject already exists"
    });
  }
});

/* =========================
   ADMIN TEST LIST
========================= */

app.get("/api/admin/tests", auth, owner, (req, res) => {
  const tests = db
    .prepare(`
      SELECT
        t.id,
        t.name,
        t.subject_id,
        s.name AS subject_name,
        t.time_minutes,
        COUNT(q.id) AS question_count
      FROM tests t
      LEFT JOIN subjects s
        ON s.id = t.subject_id
      LEFT JOIN questions q
        ON q.test_id = t.id
      GROUP BY t.id
      ORDER BY t.id DESC
    `)
    .all();

  res.json(tests);
});

/* =========================
   CREATE TEST
========================= */

app.post("/api/admin/tests", auth, owner, (req, res) => {
  try {
    const {
      name,
      subjectId,
      timeMinutes
    } = req.body;

    const testName = String(name || "").trim();
    const subject = Number(subjectId);
    const minutes = Number(timeMinutes) || 10;

    if (!testName) {
      return res.status(400).json({
        error: "Test name required"
      });
    }

    if (!subject) {
      return res.status(400).json({
        error: "Subject required"
      });
    }

    const subjectExists = db
      .prepare("SELECT id FROM subjects WHERE id = ?")
      .get(subject);

    if (!subjectExists) {
      return res.status(400).json({
        error: "Selected subject not found"
      });
    }

    const result = db.prepare(`
      INSERT INTO tests(name,subject_id,time_minutes)
      VALUES(?,?,?)
    `).run(testName, subject, minutes);

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

/* =========================
   DELETE TEST
========================= */

app.delete("/api/admin/tests/:id", auth, owner, (req, res) => {
  const id = Number(req.params.id);

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM questions WHERE test_id = ?").run(id);
    db.prepare("DELETE FROM results WHERE test_id = ?").run(id);
    db.prepare("DELETE FROM tests WHERE id = ?").run(id);
  });

  transaction();

  res.json({
    ok: true
  });
});

/* =========================
   ADD QUESTION
========================= */

app.post("/api/admin/questions", auth, owner, (req, res) => {
  try {
    const {
      testId,
      topic,
      question,
      a,
      b,
      c,
      d,
      correct
    } = req.body;

    const test = db
      .prepare(`
        SELECT id,subject_id
        FROM tests
        WHERE id = ?
      `)
      .get(Number(testId));

    if (!test) {
      return res.status(400).json({
        error: "Selected test not found"
      });
    }

    if (!question || !a || !b || !c || !d || !correct) {
      return res.status(400).json({
        error: "Question, all options and correct answer required"
      });
    }

    const answer = String(correct).toUpperCase();

    if (!["A", "B", "C", "D"].includes(answer)) {
      return res.status(400).json({
        error: "Correct answer must be A, B, C or D"
      });
    }

    const result = db.prepare(`
      INSERT INTO questions(
        test_id,
        subject_id,
        topic,
        question,
        a,
        b,
        c,
        d,
        correct
      )
      VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
      Number(testId),
      test.subject_id,
      String(topic || "General").trim(),
      String(question).trim(),
      String(a).trim(),
      String(b).trim(),
      String(c).trim(),
      String(d).trim(),
      answer
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

/* =========================
   ADMIN QUESTIONS
========================= */

app.get("/api/admin/questions", auth, owner, (req, res) => {
  const questions = db
    .prepare(`
      SELECT
        q.id,
        q.test_id,
        t.name AS test_name,
        q.subject_id,
        s.name AS subject_name,
        q.topic,
        q.question,
        q.a,
        q.b,
        q.c,
        q.d,
        q.correct
      FROM questions q
      LEFT JOIN tests t
        ON t.id = q.test_id
      LEFT JOIN subjects s
        ON s.id = q.subject_id
      ORDER BY q.id DESC
    `)
    .all();

  res.json(questions);
});

/* =========================
   DELETE QUESTION
========================= */

app.delete("/api/admin/questions/:id", auth, owner, (req, res) => {
  db.prepare("DELETE FROM questions WHERE id = ?")
    .run(Number(req.params.id));

  res.json({
    ok: true
  });
});

/* =========================
   ADMIN STATS
========================= */

app.get("/api/admin/stats", auth, owner, (req, res) => {
  const students = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'student'
    `)
    .get().count;

  const tests = db
    .prepare("SELECT COUNT(*) AS count FROM tests")
    .get().count;

  const questions = db
    .prepare("SELECT COUNT(*) AS count FROM questions")
    .get().count;

  const results = db
    .prepare("SELECT COUNT(*) AS count FROM results")
    .get().count;

  const subjects = db
    .prepare("SELECT COUNT(*) AS count FROM subjects")
    .get().count;

  res.json({
    students,
    tests,
    questions,
    results,
    subjects
  });
});

/* =========================
   ADMIN USERS
========================= */

app.get("/api/admin/users", auth, owner, (req, res) => {
  const users = db
    .prepare(`
      SELECT
        id,
        name,
        email,
        role,
        created_at
      FROM users
      ORDER BY id DESC
    `)
    .all();

  res.json(users);
});

/* =========================
   ADMIN RESULTS
========================= */

app.get("/api/admin/results", auth, owner, (req, res) => {
  const results = db
    .prepare(`
      SELECT
        r.id,
        u.name AS student_name,
        u.email,
        t.name AS test_name,
        s.name AS subject_name,
        r.score,
        r.total,
        r.created_at
      FROM results r
      LEFT JOIN users u
        ON u.id = r.user_id
      LEFT JOIN tests t
        ON t.id = r.test_id
      LEFT JOIN subjects s
        ON s.id = t.subject_id
      ORDER BY r.id DESC
    `)
    .all();

  res.json(results);
});

/* =========================
   HOME
========================= */

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Test Wala running on port " + PORT);
});
