import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import '../styles/theme.css';
import '../styles/legal.css';

export default function TermsOfServicePage() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <SEOHead title="Terms of Service" description="DebateForge terms of service — rules and guidelines for using our platform." path="/terms" />
      <div className="legal-container">
        <button className="legal-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="legal-title">Terms of Service</h1>
        <div className="legal-updated">Last updated: November 2026</div>

        <div className="legal-note">
          📝 This is a template terms of service. Please consult a legal professional for your final terms.
        </div>

        <div className="legal-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using DebateForge, you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the platform.
          </p>
        </div>

        <div className="legal-section">
          <h2>2. Description of Service</h2>
          <p>
            DebateForge is an AI-powered debate practice platform that allows users to practice
            argumentation skills through AI-generated debates, receive performance scoring, and
            track improvement over time.
          </p>
        </div>

        <div className="legal-section">
          <h2>3. User Accounts</h2>
          <p>To access certain features, you must create an account. You are responsible for:</p>
          <ul>
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Providing accurate and current registration information</li>
            <li>Notifying us of any unauthorized use of your account</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>4. User Conduct</h2>
          <p>When using DebateForge, you agree not to:</p>
          <ul>
            <li>Use the platform for any unlawful purpose</li>
            <li>Submit content that is hateful, threatening, or harassing</li>
            <li>Attempt to interfere with the platform's functionality</li>
            <li>Create multiple accounts to manipulate leaderboard rankings</li>
            <li>Use automated tools to access the platform without permission</li>
            <li>Submit fake or misleading feedback or reviews</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>5. Intellectual Property</h2>
          <p>
            The DebateForge platform, including its design, features, and content, is the
            intellectual property of DebateForge. Your debate content remains yours, but you
            grant us a license to use anonymized data for improving our AI systems.
          </p>
        </div>

        <div className="legal-section">
          <h2>6. Limitation of Liability</h2>
          <p>
            DebateForge is provided "as is" without warranties of any kind. We are not liable
            for any indirect, incidental, or consequential damages arising from your use of
            the platform. AI-generated debate responses are for practice purposes and should
            not be considered professional advice.
          </p>
        </div>

        <div className="legal-section">
          <h2>7. Modifications</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the
            platform after changes constitutes acceptance of the modified terms.
          </p>
        </div>

        <div className="legal-contact">
          <h2>Contact Us</h2>
          <p>
            If you have questions about these terms, contact us at{' '}
            <a href="mailto:legal@debateforge.tech">legal@debateforge.tech</a>
          </p>
        </div>
      </div>
    </div>
  );
}
