import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import '../styles/theme.css';
import '../styles/legal.css';

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <SEOHead title="Privacy Policy" description="DebateForge privacy policy — how we collect, use, and protect your data." path="/privacy" />
      <div className="legal-container">
        <button className="legal-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="legal-title">Privacy Policy</h1>
        <div className="legal-updated">Last updated: November 2026</div>

        <div className="legal-note">
          📝 This is a template privacy policy. Please consult a legal professional for your final privacy policy.
        </div>

        <div className="legal-section">
          <h2>1. Information We Collect</h2>
          <p>When you use DebateForge, we may collect the following information:</p>
          <ul>
            <li>Account information (username, email address, encrypted password)</li>
            <li>Debate content and performance data (arguments, scores, fallacy records)</li>
            <li>Usage data (pages visited, features used, session duration)</li>
            <li>Device and browser information for analytics and compatibility</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide and improve the DebateForge platform</li>
            <li>Track your debate performance and display analytics</li>
            <li>Maintain leaderboard rankings</li>
            <li>Send important account-related communications</li>
            <li>Improve our AI debate opponents and scoring systems</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>3. Data Storage and Security</h2>
          <p>
            Your data is stored on secure servers. Passwords are hashed using industry-standard
            encryption. We implement appropriate technical and organizational measures to protect
            your personal data against unauthorized access, alteration, or destruction.
          </p>
        </div>

        <div className="legal-section">
          <h2>4. Cookies and Local Storage</h2>
          <p>
            DebateForge uses HTTP-only cookies for authentication sessions and local storage
            for user preferences. We use Vercel Analytics for anonymous usage statistics.
            We do not use third-party advertising cookies.
          </p>
        </div>

        <div className="legal-section">
          <h2>5. Third-Party Services</h2>
          <p>We may use the following third-party services:</p>
          <ul>
            <li>AI language model providers for debate responses</li>
            <li>Vercel for hosting and analytics</li>
            <li>Stripe for payment processing (if applicable)</li>
            <li>Email service providers for transactional emails</li>
          </ul>
          <p>Each third-party service has its own privacy policy governing the use of your information.</p>
        </div>

        <div className="legal-section">
          <h2>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal data</li>
            <li>Update or correct your information</li>
            <li>Delete your account and associated data</li>
            <li>Opt out of non-essential communications</li>
          </ul>
        </div>

        <div className="legal-contact">
          <h2>Contact Us</h2>
          <p>
            If you have questions about this privacy policy, contact us at{' '}
            <a href="mailto:privacy@debateforge.tech">privacy@debateforge.tech</a>
          </p>
        </div>
      </div>
    </div>
  );
}
