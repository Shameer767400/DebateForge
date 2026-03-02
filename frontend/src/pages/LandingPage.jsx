import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

function LandingPage() {
  const navigate = useNavigate();
  const pageRef = useRef(null);

  /* ── smooth scroll ── */
  useEffect(() => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = previous;
    };
  }, []);

  /* ── IntersectionObserver for scroll reveals ── */
  useEffect(() => {
    const els = pageRef.current?.querySelectorAll('.landing-reveal');
    if (!els?.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const styles = {
    page: {
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #181826 0, #050508 60%)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-ui)',
    },
    container: {
      maxWidth: '1120px',
      margin: '0 auto',
      padding: '3rem 1.5rem 4rem',
    },
    hero: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '3rem',
      position: 'relative',
      flexWrap: 'wrap',
    },
    heroLeft: {
      maxWidth: '620px',
      zIndex: 2,
      flex: '1 1 340px',
    },
    heroTitle: {
      fontFamily: 'var(--font-debate)',
      fontSize: '3.8rem',
      lineHeight: 1.05,
      letterSpacing: '0.03em',
      margin: '0 0 1.5rem',
    },
    heroAccent: {
      background:
        'linear-gradient(120deg, var(--accent-user), var(--accent-ai))',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
    },
    heroSub: {
      fontSize: '1.05rem',
      color: 'var(--text-secondary)',
      maxWidth: '460px',
      lineHeight: 1.6,
      marginBottom: '2rem',
    },
    heroButtons: {
      display: 'flex',
      gap: '1rem',
      marginBottom: '1.5rem',
      flexWrap: 'wrap',
    },
    primaryBtn: {
      padding: '0.9rem 1.8rem',
      borderRadius: '999px',
      border: 'none',
      cursor: 'pointer',
      background:
        'linear-gradient(135deg, var(--accent-user), var(--accent-blue))',
      color: '#020309',
      fontWeight: 600,
      fontSize: '0.95rem',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    },
    secondaryBtn: {
      padding: '0.9rem 1.6rem',
      borderRadius: '999px',
      cursor: 'pointer',
      border: '1px solid var(--border)',
      background: 'rgba(10, 10, 15, 0.8)',
      color: 'var(--text-secondary)',
      fontWeight: 500,
      fontSize: '0.95rem',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    heroMeta: {
      fontSize: '0.8rem',
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
    },
    heroRight: {
      flex: '1 1 260px',
      minHeight: '260px',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridBackground: {
      position: 'absolute',
      inset: '0',
      backgroundImage:
        'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      backgroundSize: '36px 36px',
      opacity: 0.65,
      maskImage:
        'radial-gradient(circle at center, black 0, black 50%, transparent 85%)',
    },
    orb: {
      width: '260px',
      height: '260px',
      borderRadius: '50%',
      background:
        'conic-gradient(from 140deg, rgba(0,255,135,0.9), rgba(0,170,255,0.85), rgba(255,51,102,0.9), rgba(0,255,135,0.9))',
      filter: 'blur(0.5px)',
      position: 'relative',
    },
    orbInner: {
      position: 'absolute',
      inset: '18%',
      borderRadius: '50%',
      background:
        'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.25), transparent 55%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.9), #020309)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(22px)',
    },
    heroBadge: {
      position: 'absolute',
      bottom: '10%',
      left: '50%',
      padding: '0.5rem 0.9rem',
      borderRadius: '999px',
      background: 'rgba(4, 13, 18, 0.9)',
      border: '1px solid var(--border)',
      fontSize: '0.75rem',
      color: 'var(--text-secondary)',
      display: 'flex',
      gap: '0.25rem',
      alignItems: 'center',
    },
    section: {
      padding: '4rem 0',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    },
    sectionHeader: {
      marginBottom: '2.5rem',
    },
    sectionLabel: {
      fontSize: '0.8rem',
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      color: 'var(--text-muted)',
      marginBottom: '0.4rem',
    },
    sectionTitle: {
      fontFamily: 'var(--font-debate)',
      fontSize: '1.8rem',
      margin: 0,
    },
    howGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '1.5rem',
      marginTop: '1.5rem',
    },
    howCard: {
      padding: '1.4rem 1.3rem',
      borderRadius: 'var(--radius)',
      background:
        'linear-gradient(145deg, rgba(18,18,26,0.98), rgba(10,10,15,0.98))',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow)',
    },
    howIcon: {
      fontSize: '1.4rem',
      marginBottom: '0.6rem',
    },
    howTitle: {
      fontSize: '1rem',
      marginBottom: '0.2rem',
    },
    howText: {
      fontSize: '0.9rem',
      color: 'var(--text-secondary)',
    },
    featuresGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '1.3rem',
      marginTop: '1.8rem',
    },
    featureCard: {
      padding: '1.3rem 1.3rem',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      background:
        'radial-gradient(circle at top left, rgba(0,255,135,0.08), transparent 55%), #090910',
    },
    featureTitle: {
      fontSize: '0.95rem',
      marginBottom: '0.3rem',
    },
    featureTagline: {
      fontSize: '0.8rem',
      color: 'var(--text-secondary)',
    },
    socialProof: {
      marginTop: '1.5rem',
    },
    socialSubtitle: {
      fontSize: '0.95rem',
      color: 'var(--text-secondary)',
      marginBottom: '1.4rem',
    },
    testimonialGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: '1.3rem',
    },
    testimonialCard: {
      padding: '1.3rem',
      borderRadius: 'var(--radius)',
      background: 'rgba(11, 11, 18, 0.95)',
      border: '1px solid rgba(255,255,255,0.05)',
    },
    testimonialQuote: {
      fontSize: '0.9rem',
      color: 'var(--text-secondary)',
      marginBottom: '0.9rem',
      fontStyle: 'italic',
    },
    testimonialAuthor: {
      fontSize: '0.85rem',
      color: 'var(--text-muted)',
    },
    footer: {
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '1.6rem 1.5rem 2.2rem',
      fontSize: '0.8rem',
      color: 'var(--text-muted)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '1rem',
    },
  };

  return (
    <div style={styles.page} ref={pageRef}>
      <main style={styles.container}>
        {/* HERO */}
        <section style={styles.hero} id="top">
          <div style={styles.heroLeft} className="landing-hero-left">
            <p style={styles.heroMeta} className="landing-hero-meta">AI POWERED DEBATE TRAINING</p>
            <h1 style={styles.heroTitle}>
              Debate Smarter.
              <br />
              <span style={styles.heroAccent}>Every Single Day.</span>
            </h1>
            <p style={styles.heroSub}>
              The AI opponent that studies your habits, memorizes your fallacies,
              and comes back sharper in every round. Stop arguing in the dark —
              see exactly where your reasoning breaks.
            </p>
            <div style={styles.heroButtons}>
              <button
                type="button"
                style={styles.primaryBtn}
                className="landing-primary-btn"
                onClick={() => navigate('/register')}
              >
                Start Debating Free
              </button>
              <button
                type="button"
                style={styles.secondaryBtn}
                className="landing-secondary-btn"
                onClick={() => navigate('/login')}
              >
                Sign In
              </button>
            </div>
            <p style={styles.heroMeta} className="landing-hero-meta">
              No credit card. No gimmicks. Just ruthless practice.
            </p>
          </div>

          <div style={styles.heroRight} className="landing-hero-right">
            <div style={styles.gridBackground} className="landing-grid-bg" />
            <div style={styles.orb} className="landing-orb">
              <div style={styles.orbInner} className="landing-orb-inner" />
            </div>
            <div style={styles.heroBadge} className="landing-hero-badge">
              <span>Live fallacy radar · Elo-style rating · Voice-first</span>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={styles.section} id="how">
          <div style={styles.sectionHeader} className="landing-section-header landing-reveal">
            <div style={styles.sectionLabel}>How it works</div>
            <h2 style={styles.sectionTitle}>Three steps. Endless rounds.</h2>
          </div>
          <div style={styles.howGrid}>
            <div style={styles.howCard} className="landing-card landing-reveal">
              <div style={styles.howIcon}>🎤</div>
              <div style={styles.howTitle}>Speak</div>
              <p style={styles.howText}>
                State your argument naturally by voice. No scripts, no prompts —
                just how you&apos;d argue in a real room.
              </p>
            </div>
            <div style={styles.howCard} className="landing-card landing-reveal">
              <div style={styles.howIcon}>🤖</div>
              <div style={styles.howTitle}>AI Fights Back</div>
              <p style={styles.howText}>
                DebateBot counters with researched facts, calls out your fallacies,
                and pushes your position to its breaking point.
              </p>
            </div>
            <div style={styles.howCard} className="landing-card landing-reveal">
              <div style={styles.howIcon}>📈</div>
              <div style={styles.howTitle}>You Improve</div>
              <p style={styles.howText}>
                Track which fallacies you lean on, how your scores move, and close
                your weak spots one session at a time.
              </p>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section style={styles.section} id="features">
          <div style={styles.sectionHeader} className="landing-section-header landing-reveal">
            <div style={styles.sectionLabel}>Inside DebateForge</div>
            <h2 style={styles.sectionTitle}>Built for real competitors.</h2>
          </div>
          <div style={styles.featuresGrid}>
            <div style={styles.featureCard} className="landing-card landing-reveal">
              <h3 style={styles.featureTitle}>Voice Debate 🎙️</h3>
              <p style={styles.featureTagline}>
                Argue out loud with low-latency transcription tuned for real debate cadence.
              </p>
            </div>
            <div style={styles.featureCard} className="landing-card landing-reveal">
              <h3 style={styles.featureTitle}>Fallacy Detection ⚠️</h3>
              <p style={styles.featureTagline}>
                Live classification of slippery slopes, ad hominems, false dichotomies and more.
              </p>
            </div>
            <div style={styles.featureCard} className="landing-card landing-reveal">
              <h3 style={styles.featureTitle}>Memory System 🧠</h3>
              <p style={styles.featureTagline}>
                Long-term memory of your arguments so the AI actually learns you over time.
              </p>
            </div>
            <div style={styles.featureCard} className="landing-card landing-reveal">
              <h3 style={styles.featureTitle}>Score Tracking 📊</h3>
              <p style={styles.featureTagline}>
                Logic, evidence, clarity scores every round — with Elo-style rating for progress.
              </p>
            </div>
            <div style={styles.featureCard} className="landing-card landing-reveal">
              <h3 style={styles.featureTitle}>Human 1v1 Mode 👥 <span className="coming-soon-badge">Coming Soon</span></h3>
              <p style={styles.featureTagline}>
                Pair with a friend while DebateForge scores and flags fallacies in the background.
              </p>
            </div>
            <div style={styles.featureCard} className="landing-card landing-reveal">
              <h3 style={styles.featureTitle}>Debate Replay ▶️ <span className="coming-soon-badge">Coming Soon</span></h3>
              <p style={styles.featureTagline}>
                Scroll through transcripts, jump to weak turns, and relive the exact moment you lost the room.
              </p>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section style={styles.section} id="social">
          <div style={styles.sectionHeader} className="landing-section-header landing-reveal">
            <div style={styles.sectionLabel}>Social proof</div>
            <h2 style={styles.sectionTitle}>Join 10,000+ debaters improving daily.</h2>
          </div>
          <div style={styles.socialProof}>
            <p style={styles.socialSubtitle} className="landing-reveal">
              From high school circuit grinders to founders prepping investor pitches —
              DebateForge is the daily sparring partner they were missing.
            </p>
            <div style={styles.testimonialGrid}>
              <div style={styles.testimonialCard} className="landing-testimonial landing-reveal">
                <p style={styles.testimonialQuote}>
                  &quot;After two weeks my coach stopped asking generic questions and
                  started asking if I was secretly scrimming against a team.&quot;
                </p>
                <p style={styles.testimonialAuthor}>— Maya, HS Policy Debater</p>
              </div>
              <div style={styles.testimonialCard} className="landing-testimonial landing-reveal">
                <p style={styles.testimonialQuote}>
                  &quot;The fallacy graphs were brutal to look at — and exactly what I
                  needed before stepping on stage.&quot;
                </p>
                <p style={styles.testimonialAuthor}>— Andre, Startup Founder</p>
              </div>
              <div style={styles.testimonialCard} className="landing-testimonial landing-reveal">
                <p style={styles.testimonialQuote}>
                  &quot;Feels less like &apos;using an app&apos; and more like sparring
                  with a rival who&apos;s read every bad habit I have.&quot;
                </p>
                <p style={styles.testimonialAuthor}>— Lina, University Debater</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer style={styles.footer} className="landing-footer landing-reveal">
        <span>© {new Date().getFullYear()} DebateForge. All rights reserved.</span>
        <span>Built with ❤️ for the DebateForge Hackathon.</span>
      </footer>
    </div>
  );
}

export default LandingPage;

