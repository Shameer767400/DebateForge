import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { animate, stagger, splitText } from 'animejs';
import '../styles/landing.css';

const FEATURES = [
  { icon: '🎙️', title: 'Voice Debate', desc: 'Argue out loud with low-latency transcription tuned for real debate cadence.' },
  { icon: '⚠️', title: 'Live Fallacy Radar', desc: 'Real-time detection of slippery slopes, ad hominems, false dichotomies and more.' },
  { icon: '🧠', title: 'AI Memory Engine', desc: 'Long-term memory of every argument so the AI actually learns your habits over time.' },
  { icon: '📊', title: 'Score Tracking', desc: 'Logic, evidence, clarity scores every round — with Elo-style rating for progress.' },
  { icon: '🏆', title: 'Global Leaderboard', desc: 'Compete with debaters worldwide and climb the ranks as your skills sharpen.' },
  { icon: '👥', title: 'Multiplayer Rooms', desc: 'Challenge friends in live rooms with AI moderation and real-time scoring.' },
];

const STATS = [
  { value: '10K+', label: 'Active Debaters' },
  { value: '250K+', label: 'Debates Completed' },
  { value: '98%', label: 'Improved Win Rate' },
  { value: '40+', label: 'Debate Formats' },
];

const TESTIMONIALS = [
  { quote: '"After two weeks my coach stopped asking generic questions and started asking if I was secretly scrimming against a team."', author: 'Maya', role: 'HS Policy Debater' },
  { quote: '"The fallacy graphs were brutal to look at — and exactly what I needed before stepping on stage."', author: 'Andre', role: 'Startup Founder' },
  { quote: '"Feels less like using an app and more like sparring with a rival who\'s read every bad habit I have."', author: 'Lina', role: 'University Debater' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  /* ── Particle canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.6 ? '#00ff87' : Math.random() > 0.5 ? '#00aaff' : '#ff3366',
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  /* ── Scroll reveal ── */
  useEffect(() => {
    const els = pageRef.current?.querySelectorAll('.landing-reveal');
    if (!els?.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* ── Mouse parallax on hero orb ── */
  useEffect(() => {
    const handler = (e) => setMousePos({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  /* ── Anime.js character animation ── */
  useEffect(() => {
    // Small timeout to let the DOM settle after mount
    const timer = setTimeout(() => {
      try {
        // Animate hero accent title characters
        const accentEl = document.querySelector('.lp-anime-chars');
        if (!accentEl) return;
        const { chars } = splitText(accentEl, { words: false, chars: true });
        animate(chars, {
          y: [
            { to: '-2.75rem', ease: 'outExpo', duration: 600 },
            { to: 0, ease: 'outBounce', duration: 800, delay: 100 },
          ],
          rotate: {
            from: '-1turn',
            delay: 0,
          },
          delay: stagger(50),
          ease: 'inOutCirc',
          loopDelay: 1000,
          loop: true,
        });
      } catch (err) {
        // Silently skip if animejs fails (e.g. SSR / old build)
        console.warn('[Anime.js] animation skipped:', err.message);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="lp-page" ref={pageRef}>
      {/* Particle canvas background */}
      <canvas ref={canvasRef} className="lp-canvas" />

      {/* ══════════ HERO ══════════ */}
      <section className="lp-hero" id="top">
        <div className="lp-hero-content">
          <div className="lp-hero-badge landing-reveal">
            <span className="lp-hero-badge-dot" />
            AI-Powered Debate Training Platform
          </div>

          <h1 className="lp-hero-title landing-reveal">
            Debate Smarter.
            <br />
            <span className="lp-hero-accent lp-anime-chars">Win Every Room.</span>
          </h1>

          <p className="lp-hero-sub landing-reveal">
            The AI opponent that studies your habits, memorizes your fallacies,
            and comes back sharper every round. Stop arguing in the dark —
            see exactly where your reasoning breaks.
          </p>

          <div className="lp-hero-actions landing-reveal">
            <button className="lp-btn-primary" onClick={() => navigate('/register')}>
              <span>Start Debating Free</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button className="lp-btn-secondary" onClick={() => navigate('/login')}>
              Sign In
            </button>
          </div>

          <div className="lp-hero-trust landing-reveal">
            <span className="lp-trust-dot" />
            <span>No credit card required</span>
            <span className="lp-trust-sep">·</span>
            <span className="lp-trust-dot" />
            <span>Free forever plan</span>
            <span className="lp-trust-sep">·</span>
            <span className="lp-trust-dot" />
            <span>10,000+ debaters</span>
          </div>
        </div>

        {/* Orb visual */}
        <div
          className="lp-hero-visual landing-reveal"
          style={{ transform: `translate(${mousePos.x * 18}px, ${mousePos.y * 14}px)` }}
        >
          <div className="lp-orb-wrap">
            <div className="lp-orb-ring lp-orb-ring--1" />
            <div className="lp-orb-ring lp-orb-ring--2" />
            <div className="lp-orb-ring lp-orb-ring--3" />
            <div className="lp-orb-core">
              <span className="lp-orb-icon">⚔</span>
            </div>
            {/* Floating stat chips */}
            <div className="lp-chip lp-chip--1">🏆 ELO +42</div>
            <div className="lp-chip lp-chip--2">⚠️ Fallacy Caught</div>
            <div className="lp-chip lp-chip--3">📈 Score: 87</div>
            <div className="lp-chip lp-chip--4">🎯 Round 4/6</div>
          </div>
        </div>
      </section>

      {/* ══════════ STATS STRIP ══════════ */}
      <section className="lp-stats-strip">
        {STATS.map((s, i) => (
          <div key={i} className="lp-stat-item landing-reveal">
            <div className="lp-stat-value">{s.value}</div>
            <div className="lp-stat-label">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ══════════ HOW IT WORKS ══════════ */}
      <section className="lp-section" id="how">
        <div className="lp-section-label landing-reveal">How it works</div>
        <h2 className="lp-section-title landing-reveal">Three steps. Endless rounds.</h2>

        <div className="lp-how-grid">
          {[
            { step: '01', icon: '🎤', title: 'Speak Your Argument', desc: 'State your position naturally by voice or text — no scripts, no prompts. Just how you\'d argue in a real room.' },
            { step: '02', icon: '🤖', title: 'AI Fights Back', desc: 'DebateBot counters with researched facts, calls out your fallacies live, and pushes your position to its breaking point.' },
            { step: '03', icon: '📈', title: 'You Get Sharper', desc: 'Track which fallacies you lean on, see how your scores evolve, and close your weak spots one session at a time.' },
          ].map((item, i) => (
            <div key={i} className="lp-how-card landing-reveal">
              <div className="lp-how-step">{item.step}</div>
              <div className="lp-how-icon">{item.icon}</div>
              <h3 className="lp-how-title">{item.title}</h3>
              <p className="lp-how-desc">{item.desc}</p>
              {i < 2 && <div className="lp-how-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ FEATURES ══════════ */}
      <section className="lp-section lp-section--dark" id="features">
        <div className="lp-section-label landing-reveal">Inside DebateForge</div>
        <h2 className="lp-section-title landing-reveal">Built for real competitors.</h2>
        <p className="lp-section-sub landing-reveal">Every feature was designed to expose your weaknesses and force you to fix them.</p>

        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-feature-card landing-reveal">
              <div className="lp-feature-icon">{f.icon}</div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
              <div className="lp-feature-glow" />
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ TESTIMONIALS ══════════ */}
      <section className="lp-section" id="social">
        <div className="lp-section-label landing-reveal">Community</div>
        <h2 className="lp-section-title landing-reveal">Join 10,000+ debaters improving daily.</h2>

        <div className="lp-testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="lp-testimonial-card landing-reveal">
              <div className="lp-testimonial-stars">★★★★★</div>
              <p className="lp-testimonial-quote">{t.quote}</p>
              <div className="lp-testimonial-author">
                <div className="lp-testimonial-avatar">{t.author[0]}</div>
                <div>
                  <div className="lp-testimonial-name">{t.author}</div>
                  <div className="lp-testimonial-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ CTA BANNER ══════════ */}
      <section className="lp-cta-banner landing-reveal">
        <div className="lp-cta-content">
          <h2 className="lp-cta-title">Ready to forge your arguments?</h2>
          <p className="lp-cta-sub">Join thousands of debaters sharpening their skills every day. It's free to start.</p>
          <button className="lp-btn-primary lp-btn-large" onClick={() => navigate('/register')}>
            <span>Create Free Account</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div className="lp-cta-bg-glow" />
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="lp-footer landing-reveal">
        <div className="lp-footer-logo">
          <span>⚔</span> DebateForge
        </div>
        <div className="lp-footer-links">
          <a href="#top" className="lp-footer-link">Home</a>
          <a href="#features" className="lp-footer-link">Features</a>
          <a href="#how" className="lp-footer-link">How It Works</a>
          <button className="lp-footer-link lp-footer-btn" onClick={() => navigate('/login')}>Sign In</button>
          <button className="lp-footer-link lp-footer-btn" onClick={() => navigate('/register')}>Register</button>
        </div>
        <div className="lp-footer-copy">© {new Date().getFullYear()} DebateForge. Built for relentless debaters.</div>
      </footer>
    </div>
  );
}
