import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

//const reviews = [];

const DATA_DIR = path.join(__dirname, 'data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');

function ensureStore() {
     if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
     if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, '[]', 'utf8');
}

function loadReviews() {
     ensureStore();
     return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
}

function saveReviews(reviews) {
     ensureStore();
     const tmp = REVIEWS_FILE + '.tmp';
     fs.writeFileSync(tmp, JSON.stringify(reviews, null, 2), 'utf8');
     fs.renameSync(tmp, REVIEWS_FILE); // atomic swap
}

let reviews = loadReviews();
let patched = false;
for (const r of reviews) {
     if (!r.id) { r.id = randomUUID(); patched = true; }
}
if (patched) saveReviews(reviews);

// multer storage + filter
const storage = multer.diskStorage({
     destination: (_req, _file, cb) => cb(null, uploadDir),
     filename: (_req, file, cb) => {
          const safe = file.originalname.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "");
          cb(null, `${Date.now()}-${safe}`);
     }
});
const upload = multer({
     storage,
     limits: { fileSize: 5 * 1024 * 1024 },                 // 5MB
     fileFilter: (_req, file, cb) =>
          file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Only images allowed"))
});

app.get("/", (req, res) => {
     res.render("index.ejs", { reviews });
});

app.get("/create", (req, res) => {
     res.render("create.ejs");
});

app.get("/edit", (req, res) => {
     res.render("edit.ejs", { reviews });
})
// Edit form for one review
app.get("/edit/:id", (req, res) => {
     const review = reviews.find(r => r.id === req.params.id);
     if (!review) return res.status(404).send("Review not found");
     res.render("edit-review.ejs", { review });
});

// Full review page
app.get("/review/:id", (req, res) => {
     const review = reviews.find(r => r.id === req.params.id);
     if (!review) return res.status(404).send("Review not found");
     res.render("review.ejs", { review });
});

// Save edits
app.post("/edit/:id", (req, res) => {
     const i = reviews.findIndex(r => r.id === req.params.id);
     if (i === -1) return res.status(404).send("Review not found");

     reviews[i] = {
          ...reviews[i],
          author: (req.body.authorname || "Anonymous").trim(),
          title: (req.body.reviewTitle || "Untitled").trim(),
          text: (req.body.review || "").trim(),
          // keep original date; optionally add updatedAt here
     };
     saveReviews(reviews);
     res.redirect("/edit");
});

// Delete
app.post("/delete/:id", (req, res) => {
     const r = reviews.find(x => x.id === req.params.id);
     reviews = reviews.filter(x => x.id !== req.params.id);
     saveReviews(reviews);
     if (r?.heroImagePath) fs.unlink(r.heroImagePath, () => { });
     res.redirect("/edit");
});

app.post("/submit", upload.single("heroImage"), (req, res) => {
     const review = {
          id: randomUUID(),
          author: (req.body.authorname || 'Anonymous').trim(),
          title: (req.body.reviewTitle || 'Untitled').trim(),
          text: (req.body.review || '').trim(),
          date: new Date().toLocaleDateString(),
          // store a URL we can use in <img>/<bg> and a disk path for cleanup on delete
          heroImageUrl: req.file ? `/uploads/${req.file.filename}` : "",
          heroImagePath: req.file ? path.join(uploadDir, req.file.filename) : ""
     };
     reviews.unshift(review);
     saveReviews(reviews);
     res.redirect('/');
});

app.listen(port, () => {
     console.log(`Listening on port ${port}`);
});