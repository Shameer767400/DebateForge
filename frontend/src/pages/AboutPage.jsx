import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import '../styles/theme.css';
import '../styles/about.css';

export default function AboutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="about-page">
      <SEOHead
        title="About DebateForge"
        description="Learn about DebateForge, our mission to democratize debate skills through AI, and the founder behind the platform."
        path="/about"
      />

      <div className="about-header">
        <button className="about-back" onClick={() => navigate(user ? '/dashboard' : '/')}>
          ← Back
        </button>
        <div className="about-hero">
          <h1 className="about-title">About DebateForge</h1>
          <p className="about-tagline">
            Making debate skills accessible to everyone through the power of AI.
          </p>
        </div>
      </div>

      <div className="about-content">
        {/* Vision */}
        <div className="about-section">
          <div className="about-section-label">Our Vision</div>
          <h2>Democratizing Debate Skills</h2>
          <p>
            We believe that the ability to construct logical arguments, think critically, and
            communicate persuasively should be accessible to everyone — not just those who
            can afford debate coaches or attend elite institutions.
          </p>
          <p>
            DebateForge exists to level the playing field by giving every aspiring debater a
            tireless AI opponent that adapts, challenges, and helps them grow.
          </p>
        </div>

        {/* Mission */}
        <div className="about-section">
          <div className="about-section-label">Our Mission</div>
          <h2>Build Better Thinkers</h2>
          <p>
            DebateForge is an AI-powered debate practice platform that helps users sharpen
            their argumentation skills through realistic AI debates with real-time fallacy
            detection, structured scoring, and analytics that track improvement over time.
          </p>
          <p>
            Whether you are a student preparing for competitions, a professional honing
            your persuasion skills, or simply someone who loves the art of argument,
            DebateForge is built for you.
          </p>
        </div>

        {/* Why We Built This */}
        <div className="about-section">
          <div className="about-section-label">The Story</div>
          <h2>Why DebateForge Was Created</h2>
          <p>
            Debate is one of the most valuable skills a person can develop — it teaches
            critical thinking, structured reasoning, active listening, and the ability to
            articulate ideas under pressure. Yet access to quality debate training has
            always been limited.
          </p>
          <p>
            DebateForge was born from the belief that AI can be a powerful practice partner.
            By combining advanced language models with real-time fallacy detection and
            structured scoring rubrics, we have created a platform where anyone can practice
            debating anytime, anywhere, in multiple formats and languages.
          </p>
        </div>

        {/* Founder */}
        <div className="about-founder">
          <div className="about-section-label">Founder</div>
          <img
            src="/founder.jpg"
            alt="Meerambigari Shameer"
            className="about-founder-avatar"
          />
          <div className="about-founder-name">Meerambigari Shameer</div>
          <div className="about-founder-role">Founder & Creator of DebateForge</div>
          <p className="about-founder-bio">
            Passionate about making debate skills accessible to everyone through technology.
            Building DebateForge to empower students, professionals, and lifelong learners
            to become better thinkers and communicators.
          </p>
          <a
            href="https://www.linkedin.com/in/shameer-meerambigari-53009b291/"
            className="about-linkedin"
            target="_blank"
            rel="noopener noreferrer"
          >
            🔗 Connect on LinkedIn
          </a>
        </div>

        {/* CTA */}
        <div className="about-cta">
          <h2>Ready to Start Debating?</h2>
          <p>Join DebateForge and sharpen your argumentation skills for free.</p>
          <Link to={user ? '/lobby' : '/register'} className="about-cta-btn">
            {user ? '⚔ Enter Lobby' : 'Get Started Free →'}
          </Link>
        </div>
      </div>
    </div>
  );
}
