const nodemailer = require('nodemailer');

/* ── Create reusable transporter ── */
let transporter;

const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 465;
const IS_SSL = SMTP_PORT === 465;

try {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: SMTP_PORT,
    secure: IS_SSL, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000, // 10s — fail fast on blocked ports
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  Email transporter creation failed:', err.message);
}

// Use SMTP_USER as the from address — Gmail requires the from address to match the authenticated user
const FROM = process.env.SMTP_USER || process.env.FROM_EMAIL || 'noreply@debateforge.com';
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
    console.log(`   ⚠️  SMTP not configured — logging email to console`);
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
    console.log(`📧 Sending email via SMTP to: ${to} from: ${FROM}`);
    const info = await transporter.sendMail({
      from: `"DebateForge" <${FROM}>`,
      to,
      subject,
      html,
    });
    // eslint-disable-next-line no-console
    console.log('📧 Email sent successfully:', info.messageId, '| Accepted:', info.accepted, '| Rejected:', info.rejected);
    return info;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Email send failed:', err.message);
    console.error('❌ Error code:', err.code, '| Command:', err.command);
    // Fallback to console logging
    // eslint-disable-next-line no-console
    console.log('\n📧 ══════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.log(`   ❌ SMTP FAILED — logging email to console`);
    // eslint-disable-next-line no-console
    console.log(`   To: ${to}`);
    // eslint-disable-next-line no-console
    console.log(`   Subject: ${subject}`);
    // eslint-disable-next-line no-console
    console.log(`   Body: ${html.replace(/<[^>]*>/g, '')}`);
    // eslint-disable-next-line no-console
    console.log('══════════════════════════════════════\n');
    return { accepted: [to], fallback: true, error: err.message };
  }
}

/**
 * Send email verification OTP
 */
async function sendVerificationEmail(email, otp) {
  console.log('\n📧 ══════════════════════════════════════');
  console.log(`   🔄 Sending OTP email to: ${email}`);
  console.log(`   🔢 OTP Code: ${otp}`);
  console.log(`   ⏰ Generated at: ${new Date().toISOString()}`);
  console.log('══════════════════════════════════════\n');
  
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
