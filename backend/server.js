const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log("INCOMING REQUEST:", req.method, req.url);
    next();
});

// VIDEO STORAGE CONFIGURATION
const uploadDir = path.join(__dirname, "uploads", "videos");
const videosFile = path.join(__dirname, "videos.json");

// Create video folder if it does not exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Create videos.json if it does not exist
if (!fs.existsSync(videosFile)) {
    fs.writeFileSync(videosFile, "[]");
}

// Read video information
function getVideos() {
    try {
        return JSON.parse(fs.readFileSync(videosFile, "utf8"));
    } catch (error) {
        return [];
    }
}

// Save video information
function saveVideos(videos) {
    fs.writeFileSync(
        videosFile,
        JSON.stringify(videos, null, 2)
    );
}

// Configure video upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueName =
            Date.now() + "-" +
            crypto.randomBytes(6).toString("hex") +
            ".mp4";
        cb(null, uniqueName);
    }
});

const videoUpload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        const isMP4 =
            file.mimetype === "video/mp4" &&
            path.extname(file.originalname).toLowerCase() === ".mp4";

        if (isMP4) {
            cb(null, true);
        } else {
            cb(new Error("Only MP4 videos are allowed."));
        }
    }
});

// Make uploaded videos accessible
app.use("/videos", express.static(uploadDir));

// Gmail configuration
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Temporary OTP storage
const otpStore = new Map();

// Home route
app.get("/", (req, res) => {
    res.json({
        message: "RIKON'S EXAM CENTER Backend is Running!"
    });
});

// ===============================
// VIDEO UPLOAD API
// ===============================

app.post("/api/videos", videoUpload.single("video"), (req, res) => {
    try {
        const { title, subject, chapter, description } = req.body;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select an MP4 video."
            });
        }

        if (!title || !subject || !chapter) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                message: "Title, subject and chapter are required."
            });
        }

        const videos = getVideos();

        const newVideo = {
            id: crypto.randomUUID(),
            title: title.trim(),
            subject: subject.trim(),
            chapter: chapter.trim(),
            description: (description || "").trim(),
            filename: req.file.filename,
            uploadedAt: new Date().toISOString()
        };

        videos.unshift(newVideo);
        saveVideos(videos);

        res.json({
            success: true,
            message: "Video uploaded successfully!",
            video: newVideo
        });

    } catch (error) {
        console.error("Video upload error:", error);
        res.status(500).json({
            success: false,
            message: "Video upload failed."
        });
    }
});

app.get("/api/test", (req, res) => {
    console.log("TEST API REQUEST RECEIVED!");
    res.json({
        success: true,
        message: "RIKON VIDEO API IS ACTIVE!"
    });
});

// Get all videos
app.get("/api/videos", (req, res) => {
    res.json({
        success: true,
        videos: getVideos()
    });
});

// Delete a video
app.delete("/api/videos/:id", (req, res) => {
    const videos = getVideos();
    const video = videos.find(v => v.id === req.params.id);

    if (!video) {
        return res.status(404).json({
            success: false,
            message: "Video not found."
        });
    }

    const videoPath = path.join(uploadDir, video.filename);

    if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
    }

    saveVideos(videos.filter(v => v.id !== req.params.id));

    res.json({
        success: true,
        message: "Video deleted successfully."
    });
});

// Send OTP
app.post("/api/send-otp", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid email address."
        });
    }

    const previous = otpStore.get(email);

    if (previous && Date.now() < previous.resendAt) {
        return res.status(429).json({
            success: false,
            message: "Please wait before requesting another OTP."
        });
    }

    const otp = crypto.randomInt(1000, 10000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "RIKON'S EXAM CENTER - Email Verification",
            text: "Your OTP is: " + otp + "\n\nThis OTP will expire in 5 minutes."
        });

        otpStore.set(email, {
            otpHash: otpHash,
            expiresAt: Date.now() + 5 * 60 * 1000,
            resendAt: Date.now() + 60 * 1000,
            attempts: 0
        });

        res.json({
            success: true,
            message: "OTP sent successfully. Please check your email."
        });

    } catch (error) {
        console.error("Email error:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to send OTP. Please try again."
        });
    }
});

// Verify OTP
app.post("/api/verify-otp", (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    const record = otpStore.get(email);

    if (!record) {
        return res.status(400).json({
            success: false,
            message: "Please request an OTP first."
        });
    }

    if (Date.now() > record.expiresAt) {
        otpStore.delete(email);
        return res.status(400).json({
            success: false,
            message: "OTP has expired. Please request a new one."
        });
    }

    if (!/^\d{4}$/.test(otp)) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid 4-digit OTP."
        });
    }

    record.attempts++;

    if (record.attempts > 5) {
        otpStore.delete(email);
        return res.status(429).json({
            success: false,
            message: "Too many attempts. Please request a new OTP."
        });
    }

    const submittedHash = crypto.createHash("sha256").update(otp).digest("hex");

    if (submittedHash !== record.otpHash) {
        return res.status(400).json({
            success: false,
            message: "Incorrect OTP. Please try again."
        });
    }

    otpStore.delete(email);

    res.json({
        success: true,
        message: "Email verified successfully!"
    });
});

// ===============================
// EDIT VIDEO API
// ===============================

app.put("/api/videos/:id", (req, res) => {
    const { title, subject, chapter, description } = req.body;
    const videos = getVideos();
    const videoIndex = videos.findIndex(v => v.id === req.params.id);

    if (videoIndex === -1) {
        return res.status(404).json({
            success: false,
            message: "Video not found."
        });
    }

    if (!title || !subject || !chapter) {
        return res.status(400).json({
            success: false,
            message: "Title, subject and chapter are required."
        });
    }

    videos[videoIndex] = {
        ...videos[videoIndex],
        title: title.trim(),
        subject: subject.trim(),
        chapter: chapter.trim(),
        description: (description || "").trim(),
        updatedAt: new Date().toISOString()
    };

    saveVideos(videos);

    res.json({
        success: true,
        message: "Video updated successfully!",
        video: videos[videoIndex]
    });
});

// VIDEO UPLOAD ERROR HANDLER
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                message: "Video size cannot exceed 500 MB."
            });
        }
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    if (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    next();
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});