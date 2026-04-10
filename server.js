const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Dynamic CORS for production - USE ONLY ONE cors() middleware
const allowedOrigins = [
  "http://localhost:5173", // Vite default port
  "http://localhost:3000",
  "https://e-mailer-smoky.vercel.app", // React default port
  process.env.FRONTEND_URL, // Your Vercel URL
].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        process.env.NODE_ENV !== "production"
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy does not allow origin: ${origin}`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

// Create transporter with Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
};

// Send emails with rate limiting
app.post("/api/send-emails", async (req, res) => {
  const { recipients, subject, htmlContent, senderName } = req.body;

  // Add validation for required fields
  if (!recipients || !subject || !htmlContent) {
    return res.status(400).json({
      error: "Missing required fields: recipients, subject, or htmlContent",
    });
  }

  const emailList = Array.isArray(recipients)
    ? recipients
    : recipients.split(",").map((email) => email.trim());

  // Check if there are valid recipients
  if (emailList.length === 0) {
    return res.status(400).json({
      error: "No valid recipients provided",
    });
  }

  const transporter = createTransporter();
  const results = [];
  const failedEmails = [];

  // Send one by one with delay
  for (let i = 0; i < emailList.length; i++) {
    const email = emailList[i];

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      results.push({ email, success: false, error: "Invalid email format" });
      failedEmails.push(email);
      continue;
    }

    try {
      await transporter.sendMail({
        from: `"${senderName || "Company Name"}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: subject,
        html: htmlContent,
      });

      results.push({ email, success: true });
      console.log(`✅ Sent to ${email} (${i + 1}/${emailList.length})`);

      // Wait 2 seconds between emails to avoid rate limiting
      if (i < emailList.length - 1) {
        // Don't wait after last email
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`❌ Failed to send to ${email}:`, error.message);
      results.push({ email, success: false, error: error.message });
      failedEmails.push(email);

      // If it's an authentication error, stop completely
      if (
        error.message.includes("authentication") ||
        error.message.includes("login")
      ) {
        return res.status(401).json({
          error: "Gmail authentication failed. Please check your credentials.",
          results,
        });
      }
    }
  }

  res.json({
    total: emailList.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
    failedEmails,
  });
});

// Health check endpoint (required for Render)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Test endpoint
app.get("/api/test", (req, res) => {
  res.json({
    message: "Backend server is running!",
    environment: process.env.NODE_ENV || "development",
    allowedOrigins: allowedOrigins, // For debugging
  });
});

// Test email configuration
app.post("/api/test-connection", async (req, res) => {
  const { testEmail } = req.body;

  if (!testEmail) {
    return res.status(400).json({ error: "Test email address required" });
  }

  const transporter = createTransporter();

  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `"Test" <${process.env.EMAIL_USER}>`,
      to: testEmail,
      subject: "Test Email - Connection Working!",
      html: "<h1>✅ Success!</h1><p>Your Gmail integration is working perfectly.</p>",
    });
    res.json({ success: true, message: "Test email sent successfully!" });
  } catch (error) {
    console.error("Test connection error:", error.message);
    res.status(401).json({ success: false, error: error.message });
  }
});

// Handle 404 for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Allowed origins:`, allowedOrigins);
});
