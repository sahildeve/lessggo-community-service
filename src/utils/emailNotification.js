import { Resend } from "resend";
import logger from "./logger.js";
import axios from "axios";

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  const { error } = await resend.emails.send({
    from: "LetsGoo <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
  if (error) {
    logger.error("Resend error:", { error });
    throw new Error(error.message);
  }
};

const getUserEmail = async (userId) => {
  try {
    const res = await axios.post(
      `${process.env.AUTH_SERVICE_URL}/api/auth/internal/users/emails`,
      { userIds: [userId] }
    );
    return res.data.data.users[0] || null;
  } catch (err) {
    logger.error("Get user email error:", { message: err.message });
    return null;
  }
};

// ─── Direct Chat Request — Receiver ko
export const sendChatRequestEmail = async (toUserId, fromName) => {
  try {
    const user = await getUserEmail(toUserId);
    if (!user) return;

    await sendEmail({
      to: user.email,
      subject: "New Chat Request — LetsGoo",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <h2 style="color:#1e293b;">New Chat Request 💬</h2>
          <p>Hi <strong>${user.fullName || user.username}</strong>,</p>
          <p><strong>${fromName}</strong> wants to chat with you on LetsGoo.</p>
          <p>Open the app to accept or reject.</p>
          <p style="color:#94a3b8;font-size:13px;">LetsGoo Team</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error("Send chat request email error:", { message: err.message });
  }
};