import axios from "axios";
import { Resend } from "resend";
import redis from "../config/redis.js";
import logger from "./logger.js";

// Sender must be a domain verified in Resend before real users get mail.
// onboarding@resend.dev only delivers to the Resend account owner (COMM-17).
const EMAIL_FROM = process.env.EMAIL_FROM || "Lessggo <onboarding@resend.dev>";
const EMAIL_COOLDOWN_SECONDS = 600; // max one chat-request email per receiver per 10 min

// Created lazily so a missing key never crashes the service at startup.
let resend = null;
const getResend = () => {
  if (!process.env.RESEND_API_KEY) return null;
  resend ??= new Resend(process.env.RESEND_API_KEY);
  return resend;
};

// Same internal key and timeout as the other auth calls (COMM-17).
const authClient = axios.create({
  baseURL: process.env.AUTH_SERVICE_URL,
  timeout: 5000,
  headers: { "x-internal-key": process.env.INTERNAL_SERVICE_KEY },
});

// Names go into HTML: escape them so nobody can inject links or markup.
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendEmail = async ({ to, subject, html }) => {
  const client = getResend();
  if (!client) return; // email not configured
  const { error } = await client.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message);
};

const getUserEmail = async (userId) => {
  try {
    const res = await authClient.post("/api/auth/internal/users/emails", {
      userIds: [userId],
    });
    return res.data?.data?.users?.[0] || null;
  } catch (err) {
    logger.error("Get user email error", { message: err.message });
    return null;
  }
};

// ─── Direct Chat Request — Receiver ko
export const sendChatRequestEmail = async (toUserId, fromName) => {
  try {
    // One email per receiver per cooldown, so requests cannot spam an inbox.
    const allowed = await redis
      .set(
        `email_cooldown:chat_request:${toUserId}`,
        "1",
        "EX",
        EMAIL_COOLDOWN_SECONDS,
        "NX",
      )
      .catch(() => "OK");
    if (allowed !== "OK") return;

    const user = await getUserEmail(toUserId);
    // Only verified addresses: emails are not verified at signup yet (AUTH-27).
    if (!user?.email || user.isEmailVerified !== true) return;

    await sendEmail({
      to: user.email,
      subject: "New Chat Request — Lessggo",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <h2 style="color:#1e293b;">New Chat Request 💬</h2>
          <p>Hi <strong>${escapeHtml(user.fullName || user.username)}</strong>,</p>
          <p><strong>${escapeHtml(fromName)}</strong> wants to chat with you on Lessggo.</p>
          <p>Open the app to accept or reject.</p>
          <p style="color:#94a3b8;font-size:13px;">Lessggo Team</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error("Send chat request email error", { message: err.message });
  }
};
