const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

// Dynamic CORS for production
const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL, // Replace with your actual Vercel URL
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
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
      pass: process.env.EMAIL_APP_PASSWORD, // Use App Password, not regular password
    },
  });
};

// Send emails with rate limiting
app.post("/api/send-emails", async (req, res) => {
  const { recipients, subject, htmlContent, senderName } = req.body;

  const emailList = Array.isArray(recipients)
    ? recipients
    : recipients.split(",").map((email) => email.trim());
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
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed to send to ${email}:`, error.message);
      results.push({ email, success: false, error: error.message });
      failedEmails.push(email);

      // If it's an authentication error, stop completely
      if (error.message.includes("authentication")) {
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

// Test email configuration
app.get("/api/test", (req, res) => {
  res.json({
    message: "Backend server is running!",
    environment: process.env.NODE_ENV || "development",
  });
});

app.post("/api/test-connection", async (req, res) => {
  const { testEmail } = req.body;
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
    res.status(401).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
