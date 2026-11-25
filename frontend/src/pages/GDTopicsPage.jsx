import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import '../styles/theme.css';
import '../styles/about.css';

const PLACEMENT_GD_TOPICS = [
  {
    id: 'wfh-vs-rto',
    category: 'Corporate & IT',
    title: 'Work From Home vs Return to Office: What is better for young careers?',
    forPoints: [
      'Saves 2+ hours of daily commute in Tier-1 tech cities, boosting deep work & mental health.',
      'Reduces living costs for freshers relocating away from home.',
      'Global asynchronous collaboration tools make location largely irrelevant.',
    ],
    againstPoints: [
      'In-person mentorship, whiteboard problem solving, and hallway learning accelerate junior growth.',
      'Builds stronger team trust and visibility during annual appraisal cycles.',
      'Separating workspace from living space prevents quiet burnout.',
    ],
    recruiterTip: 'Avoid extreme stances — hybrid flexibility backed by junior mentorship data wins recruiters.',
  },
  {
    id: 'gen-ai-coding-tests',
    category: 'Tech Hiring',
    title: 'Should Generative AI tools be allowed during campus placement coding tests?',
    forPoints: [
      'Mirrors real-world software engineering where copilots handle boilerplate code.',
      'Tests system design, debugging, and prompt precision instead of rote memorization.',
      'Levels the playing field for strong problem solvers who dislike memorizing syntax.',
    ],
    againstPoints: [
      'Without core DSA and algorithmic fundamentals, freshers cannot audit buggy AI code.',
      'Creates unfair evaluation variance depending on prompting tricks rather than logic.',
      'Foundational debugging instincts are eroded when students copy-paste blindly.',
    ],
    recruiterTip: 'Frame your argument around testing fundamentals in Round 1 and AI-assisted building in Round 2.',
  },
  {
    id: 'ai-vs-junior-devs',
    category: 'Future of Work',
    title: 'AI Copilots vs Junior Software Developers: Will entry-level tech hiring shrink?',
    forPoints: [
      'AI automates CRUD scaffolding, lowering companies’ need for large maintenance teams.',
      'Hiring bars are shifting from basic syntax writers to product-minded builders.',
    ],
    againstPoints: [
      'Lower software development cost explodes software demand across non-tech industries.',
      'Senior engineers must still come from somewhere — companies must train juniors to survive.',
    ],
    recruiterTip: 'Mention how upskilling into full-stack architecture and testing differentiates entry-level engineers.',
  },
  {
    id: 'moonlighting-in-it',
    category: 'Business Ethics',
    title: 'Moonlighting in IT: Legitimate entrepreneurial freedom or breach of employer trust?',
    forPoints: [
      'Outside working hours belong to the employee as long as there is zero conflict of interest.',
      'Builds entrepreneurial resilience and supplementary income without hurting primary deliverables.',
    ],
    againstPoints: [
      'Full-time employment contracts often cover exclusivity and proprietary IP risk.',
      'Dual fatigue harms code quality, sprint deadlines, and data security compliance.',
    ],
    recruiterTip: 'Distinguish between secret competitor contracting (unethical) and disclosed weekend open-source/teaching.',
  },
  {
    id: '70-hour-work-week',
    category: 'Economy & Culture',
    title: '70-Hour Work Week vs Work-Life Balance: What drives sustainable GDP growth?',
    forPoints: [
      'Developing economies require intense compounding output during demographic dividend years.',
      'Voluntary high-intensity sprints drive early-stage startup breakthroughs.',
    ],
    againstPoints: [
      'Cognitive software & creative work drops sharply in quality past 45–50 hours/week.',
      'Long-term innovation relies on health, continuous learning, and low attrition.',
    ],
    recruiterTip: 'Contrast output-based accountability vs hours-at-desk metrics using productivity statistics.',
  },
  {
    id: 'startups-burn-vs-profit',
    category: 'Startups & Finance',
    title: 'Startups: Hyper-growth with heavy cash burn vs sustainable unit economics?',
    forPoints: [
      'Winner-take-all network effects sometimes require rapid subsidy-driven market capture.',
      'Early scale creates moats before slower incumbents react.',
    ],
    againstPoints: [
      'Rising cost of capital has exposed unsustainable blitzscaling models.',
      'Healthy gross margins ensure company survival and protect employee careers.',
    ],
    recruiterTip: 'Cite CAC-to-LTV ratio and contribution margin — business vocabulary stands out in MBA/MNC GDs.',
  },
  {
    id: 'ev-vs-hybrids',
    category: 'Sustainability',
    title: 'Electric Vehicles vs Hybrids & Biofuels: Realistic transition path for India?',
    forPoints: [
      'Zero tailpipe emissions cut urban air pollution rapidly as solar grid share rises.',
      'Stronger PLI incentives accelerate domestic battery supply chains.',
    ],
    againstPoints: [
      'Charging infrastructure gaps in Tier-2/3 cities and grid coal reliance limit short-term gains.',
      'Strong hybrids cut fuel burn by 35–40% immediately without waiting for mega-chargers.',
    ],
    recruiterTip: 'Acknowledge infrastructure constraints practically rather than taking a purely idealistic green stance.',
  },
  {
    id: 'english-vs-native-tech',
    category: 'Education & Society',
    title: 'Should technical & placement training be offered in native languages like Telugu alongside English?',
    forPoints: [
      'Conceptual clarity skyrockets when students first master logic in their mother tongue.',
      'Eliminates hesitation and stage fear for bright Tier-2/3 college talent.',
    ],
    againstPoints: [
      'Global documentation and corporate MNC communication rely heavily on English fluency.',
      'Candidates must bridge from native-language thinking into clear English articulation for interviews.',
    ],
    recruiterTip: 'This is a huge DebateForge strength — explain bilingual scaffolding from Telugu conceptual clarity to crisp English delivery!',
  },
];

export default function GDTopicsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState('All');

  const categories = ['All', ...new Set(PLACEMENT_GD_TOPICS.map((t) => t.category))];
  const visibleTopics = filter === 'All'
    ? PLACEMENT_GD_TOPICS
    : PLACEMENT_GD_TOPICS.filter((t) => t.category === filter);

  const handlePracticeTopic = (title) => {
    const target = `/lobby?topic=${encodeURIComponent(title)}`;
    navigate(user ? target : `/register?redirect=${encodeURIComponent(target)}`);
  };

  return (
    <div className="about-page">
      <SEOHead
        title="Campus Placement Group Discussion Topics & Talking Points (2026)"
        description="Prepare for TCS, Infosys, Accenture, Wipro, and MBA Group Discussions with DebateForge. Review For/Against points and practice live with AI peers in English and Telugu."
        path="/gd-topics"
      />

      <div className="about-header" style={{ maxWidth: '960px' }}>
        <button className="about-back" onClick={() => navigate(user ? '/lobby' : '/')}>
          ← Back to {user ? 'Lobby' : 'Home'}
        </button>
        <div className="about-hero">
          <h1 className="about-title">Campus Placement GD Topics (2026)</h1>
          <p className="about-tagline" style={{ maxWidth: '640px' }}>
            Structured <strong>For</strong> &amp; <strong>Against</strong> talking points, recruiter tips, and instant 4-seat AI Group Discussion practice in English and Telugu.
          </p>
        </div>
      </div>

      <div className="about-content" style={{ maxWidth: '960px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              style={{
                padding: '7px 14px',
                borderRadius: '999px',
                border: filter === cat ? '1px solid #00ff87' : '1px solid rgba(255,255,255,0.14)',
                background: filter === cat ? 'rgba(0, 255, 135, 0.14)' : 'rgba(255,255,255,0.03)',
                color: filter === cat ? '#00ff87' : '#cbd5e1',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {visibleTopics.map((item) => (
          <article key={item.id} className="about-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              <span className="about-section-label" style={{ margin: 0 }}>{item.category}</span>
              <button
                type="button"
                onClick={() => handlePracticeTopic(item.title)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #00e5ff 0%, #00ff87 100%)',
                  color: '#050c18',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                🎙️ Practice in AI GD Arena →
              </button>
            </div>
            <h2 style={{ marginBottom: '14px' }}>{item.title}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '14px' }}>
              <div>
                <div style={{ color: '#00ff87', fontWeight: 800, fontSize: '0.78rem', marginBottom: '6px' }}>👍 KEY POINTS FOR</div>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.55 }}>
                  {item.forPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                </ul>
              </div>
              <div>
                <div style={{ color: '#ffaa00', fontWeight: 800, fontSize: '0.78rem', marginBottom: '6px' }}>👎 KEY POINTS AGAINST</div>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.55 }}>
                  {item.againstPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                </ul>
              </div>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', background: 'rgba(0, 229, 255, 0.06)', borderLeft: '3px solid #00e5ff', padding: '8px 12px', borderRadius: '6px' }}>
              <strong style={{ color: '#00e5ff' }}>💡 Recruiter Tip:</strong> {item.recruiterTip}
            </div>
          </article>
        ))}

        <div className="about-cta">
          <h2>Want to Test Yourself Live?</h2>
          <p>Invite 1–3 college friends via WhatsApp or spar against AI candidates Aarav, Priya &amp; Karan right now.</p>
          <Link to={user ? '/lobby' : '/register'} className="about-cta-btn">
            {user ? '⚔ Enter GD Arena' : 'Start Free Account →'}
          </Link>
        </div>
      </div>
    </div>
  );
}
