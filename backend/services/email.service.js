const nodemailer = require('nodemailer');

/* ── Create reusable transporter ── */
let transporter;

try {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  Email transporter creation failed:', err.message);
}

const FROM = process.env.FROM_EMAIL || 'noreply@debateforge.com';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();

/**
 * Send an email. Falls back to console logging if SMTP is not configured.
 */
async function sendMail({ to, subject, html }) {
  // If SMTP credentials are not configured, log to console
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_USER === 'your_email@gmail.com') {
    // eslint-disable-next-line no-console
    console.log('\n📧 ══════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.log(`   To: ${to}`);
    // eslint-disable-next-line no-console
    console.log(`   Subject: ${subject}`);
    // eslint-disable-next-line no-console
    console.log(`   Body: ${html.replace(/<[^>]*>/g, '')}`);
    // eslint-disable-next-line no-console
    console.log('══════════════════════════════════════\n');
    return { accepted: [to], fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"DebateForge" <${FROM}>`,
      to,
      subject,
      html,
    });
    return info;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Email send failed:', err.message);
    // Don't throw — email failure shouldn't crash auth flows
    return { error: err.message };
  }
}

/**
 * Send email verification link
 */
async function sendVerificationEmail(email, token) {
  const verifyUrl = `${FRONTEND_URL}/verify-email/${token}`;

  return sendMail({
    to: email,
    subject: 'DebateForge — Verify your email',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #7c5cfc;">⚔ DebateForge</h2>
        <p>Welcome to DebateForge! Please verify your email address to get the most out of your account.</p>
        <a href="${verifyUrl}" 
           style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #7c5cfc, #a855f7); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Verify Email
        </a>
        <p style="color: #888; font-size: 13px;">Or copy this link: ${verifyUrl}</p>
        <p style="color: #888; font-size: 13px;">If you didn't create this account, you can safely ignore this email.</p>
      </div>
    `,
  });
}

/**
 * Send password reset link
 */
async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${FRONTEND_URL}/reset-password/${token}`;

  return sendMail({
    to: email,
    subject: 'DebateForge — Reset your password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #7c5cfc;">⚔ DebateForge</h2>
        <p>You requested a password reset. Click the button below to set a new password.</p>
        <a href="${resetUrl}" 
           style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #7c5cfc, #a855f7); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #888; font-size: 13px;">Or copy this link: ${resetUrl}</p>
        <p style="color: #e74c3c; font-size: 13px; font-weight: 600;">⏰ This link expires in 1 hour.</p>
        <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
      </div>
    `,
  });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
