const nodemailer = require('nodemailer');

/* ─────────────────────────────────────────────────────────────
   Email Service — Dual-mode:
     1. Resend HTTP API (production — bypasses Render SMTP block)
     2. Nodemailer SMTP (local dev fallback)
───────────────────────────────────────────────────────────── */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();

/* ── Resend (HTTP API — works on all cloud hosts) ── */
async function sendViaResend({ to, subject, html }) {
  const { Resend } = require('resend');
  const resend = new Resend(RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: 'DebateForge <onboarding@resend.dev>', // Use your verified domain here once you add one
    to,
    subject,
    html,
  });

  if (error) throw new Error(error.message || JSON.stringify(error));
  // eslint-disable-next-line no-console
  console.log('📧 [RESEND] Email sent successfully:', data?.id, '→', to);
  return { accepted: [to], provider: 'resend', id: data?.id };
}

/* ── Nodemailer SMTP (local dev) ── */
let _smtpTransporter;
function getSmtpTransporter() {
  if (_smtpTransporter) return _smtpTransporter;
  const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 465;
  _smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return _smtpTransporter;
}

async function sendViaSmtp({ to, subject, html }) {
  const FROM = process.env.SMTP_USER || process.env.FROM_EMAIL || 'noreply@debateforge.com';
  const transporter = getSmtpTransporter();
  const info = await transporter.sendMail({
    from: `"DebateForge" <${FROM}>`,
    to,
    subject,
    html,
  });
  return info;
}

/* ── Main sendMail: Resend → SMTP → console fallback ── */
async function sendMail({ to, subject, html }) {
  // 1. Try Resend (HTTP — works on Render free tier)
  if (RESEND_API_KEY) {
    try {
      return await sendViaResend({ to, subject, html });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('❌ [RESEND] Failed:', err.message, '— falling back to SMTP');
    }
  }

  // 2. Try SMTP (works locally)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      return await sendViaSmtp({ to, subject, html });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('❌ [SMTP] Failed:', err.message, '— falling back to console log');
    }
  }

  // 3. Console fallback (so registration doesn't break even without email config)
  // eslint-disable-next-line no-console
  console.log('\n📧 ══════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log(`   ⚠️  No email provider configured — logging to console`);
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

/* ── OTP Verification Email ── */
async function sendVerificationEmail(email, otp) {
  // eslint-disable-next-line no-console
  console.log(`\n📧 Sending OTP email to: ${email} | OTP: ${otp}`);
  return sendMail({
    to: email,
    subject: 'DebateForge — Email Verification Code',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #7c5cfc;">⚔ DebateForge</h2>
        <p>Welcome to DebateForge! Please use the verification code below to activate your account.</p>
        <div style="background: #f8f9fa; border: 2px dashed #7c5cfc; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #7c5cfc; letter-spacing: 4px;">${otp}</span>
        </div>
        <p style="color: #888; font-size: 13px;">Enter this 6-digit code in the verification page to complete your registration.</p>
        <p style="color: #e74c3c; font-size: 13px; font-weight: 600;">⏰ This code expires in 10 minutes.</p>
        <p style="color: #888; font-size: 13px;">If you didn't create this account, you can safely ignore this email.</p>
      </div>
    `,
  });
}

/* ── Password Reset Email ── */
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
        <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
