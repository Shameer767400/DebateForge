import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/interactive-demo.css';

const DEMO_TOPICS = [
  {
    id: 'ai',
    title: 'AI will replace software engineers within 5 years',
    category: 'Technology',
    forSample: 'AI models write code 10x faster than humans, and as autonomous agents improve exponentially, human programmers will only be needed for simple prompts.',
    againstSample: 'Writing code is only 20% of engineering; 80% is understanding business trade-offs, architecture, and security, which statistical models cannot autonomously govern.',
    forCounter: 'While AI accelerates syntax generation, engineering is fundamentally system design and handling ambiguous edge cases. Speed of code production does not equal architectural judgment.',
    forFallacies: ['Hasty Generalization (assuming code speed equates to full engineering lifecycle)', 'False Equivalence (coding speed vs architectural judgment)'],
    againstCounter: 'As reasoning models chain verification steps and self-correct, the boundary of what requires "human trade-offs" is shrinking every quarter.',
    againstFallacies: ['Moving the Goalposts (narrowing the definition of software engineering to maintain human exclusivity)'],
    scoreFor: 76,
    scoreAgainst: 82,
  },
  {
    id: 'wfh',
    title: 'Work From Home is superior to working from an office',
    category: 'Career & GD',
    forSample: 'Remote work eliminates exhausting daily commutes, gives employees flexible focus hours, and allows companies to hire top talent globally without geographic restrictions.',
    againstSample: 'In-person collaboration creates spontaneous serendipity, faster problem-solving for juniors, and builds company culture that Zoom calls cannot replicate.',
    forCounter: 'Total remote isolation often leads to siloed teams, communication delays across time zones, and slower mentorship for entry-level professionals.',
    forFallacies: ['Oversimplification (ignoring team onboarding and organizational inertia)', 'Survivorship Bias (generalizing senior engineers to all workers)'],
    againstCounter: 'Commute fatigue and arbitrary office politics demonstrably reduce daily productivity, while asynchronous documentation produces clearer specifications.',
    againstFallacies: ['Appeal to Tradition (relying on "how we always worked" rather than measured output)'],
    scoreFor: 79,
    scoreAgainst: 80,
  },
  {
    id: 'college',
    title: 'College degrees are becoming obsolete in the modern job market',
    category: 'Education',
    forSample: 'Tech companies care about verified GitHub projects and practical skills, while 4-year degrees leave students with outdated curriculum and massive debt.',
    againstSample: 'A degree is a trusted signaling mechanism for discipline, baseline mathematical rigor, and social maturity that online bootcamps fail to reliably guarantee.',
    forCounter: 'A degree provides foundational theory and networking that enable career pivots decades later, whereas bootcamp skills quickly date as frameworks change.',
    forFallacies: ['False Dilemma (treating university education and practical skill-building as mutually exclusive)'],
    againstCounter: 'Credentialism creates artificial barriers to entry, excluding talented self-taught builders who can out-perform degree holders from day one.',
    againstFallacies: ['Appeal to Authority (relying on university brand prestige rather than demonstrated output)'],
    scoreFor: 81,
    scoreAgainst: 77,
  },
];

export default function InteractiveSparringDemo() {
  const navigate = useNavigate();
  const [selectedTopicIndex, setSelectedTopicIndex] = useState(0);
  const [stance, setStance] = useState('for'); // 'for' | 'against'
  const [customInput, setCustomInput] = useState(DEMO_TOPICS[0].forSample);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);

  const currentTopic = DEMO_TOPICS[selectedTopicIndex];

  const handleSelectTopic = (index) => {
    setSelectedTopicIndex(index);
    setIsCustomMode(false);
    setResult(null);
    const top = DEMO_TOPICS[index];
    setCustomInput(stance === 'for' ? top.forSample : top.againstSample);
  };

  const handleSwitchStance = (newStance) => {
    setStance(newStance);
    setResult(null);
    if (!isCustomMode) {
      setCustomInput(newStance === 'for' ? currentTopic.forSample : currentTopic.againstSample);
    }
  };

  const handleAnalyze = () => {
    if (!customInput.trim()) return;
    setIsAnalyzing(true);
    setResult(null);

    // Fast, responsive evaluation animation
    setTimeout(() => {
      setIsAnalyzing(false);
      if (!isCustomMode) {
        setResult({
          aiCounter: stance === 'for' ? currentTopic.forCounter : currentTopic.againstCounter,
          fallacies: stance === 'for' ? currentTopic.forFallacies : currentTopic.againstFallacies,
          score: stance === 'for' ? currentTopic.scoreFor : currentTopic.scoreAgainst,
          topicTitle: currentTopic.title,
        });
      } else {
        // Dynamic analysis for custom input
        const length = customInput.trim().split(/\s+/).length;
        const hasBecause = /because|since|therefore|thus|evidence|data|proves/i.test(customInput);
        const dynamicScore = Math.min(92, Math.max(65, 70 + (hasBecause ? 10 : 0) + (length > 15 ? 8 : 2)));
        
        setResult({
          aiCounter: `Your premise assumes that "${customInput.slice(0, 60)}..." is universally applicable. However, this overlooks structural counter-incentives and alternative stakeholder trade-offs that weaken your primary claim.`,
          fallacies: [
            hasBecause ? 'Minor Weak Analogy in premises' : 'Unsubstantiated Premise (requires concrete empirical backing)',
            'Confirmation Bias (focusing primarily on favorable conditions)',
          ],
          score: dynamicScore,
          topicTitle: 'Your Custom Motion',
        });
      }
    }, 450);
  };

  return (
    <section className="demo-section">
      <div className="demo-container">
        {/* Section Header */}
        <div className="demo-header">
          <div className="demo-badge">⚡ Instant Sparring Playground</div>
          <h2 className="demo-title">Test Your Argument Against the AI</h2>
          <p className="demo-subtitle">
            No signup or credit card needed. Pick a debate topic, state your claim, and watch the AI dissect your reasoning in real time.
          </p>
        </div>

        {/* Demo Playground Card */}
        <div className="demo-card">
          {/* Topic Selector Tabs */}
          <div className="demo-topic-tabs">
            {DEMO_TOPICS.map((topic, i) => (
              <button
                key={topic.id}
                className={`demo-topic-tab ${!isCustomMode && selectedTopicIndex === i ? 'demo-topic-tab--active' : ''}`}
                onClick={() => handleSelectTopic(i)}
              >
                <span className="demo-topic-category">{topic.category}</span>
                <span className="demo-topic-name">{topic.title}</span>
              </button>
            ))}
            <button
              className={`demo-topic-tab ${isCustomMode ? 'demo-topic-tab--active' : ''}`}
              onClick={() => {
                setIsCustomMode(true);
                setResult(null);
                setCustomInput('');
              }}
            >
              <span className="demo-topic-category">Custom</span>
              <span className="demo-topic-name">✍️ Your Own Argument</span>
            </button>
          </div>

          {/* Stance Selector */}
          <div className="demo-controls-row">
            <span className="demo-controls-label">Your Position:</span>
            <div className="demo-stance-toggle">
              <button
                className={`demo-stance-btn ${stance === 'for' ? 'demo-stance-btn--active-for' : ''}`}
                onClick={() => handleSwitchStance('for')}
              >
                ✓ I Agree (FOR)
              </button>
              <button
                className={`demo-stance-btn ${stance === 'against' ? 'demo-stance-btn--active-against' : ''}`}
                onClick={() => handleSwitchStance('against')}
              >
                ✕ I Disagree (AGAINST)
              </button>
            </div>
          </div>

          {/* Argument Input Area */}
          <div className="demo-input-wrap">
            <textarea
              className="demo-textarea"
              rows={3}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="State your strongest argument here..."
              maxLength={300}
            />
            <div className="demo-input-footer">
              <span className="demo-char-count">{customInput.length}/300 characters</span>
              <button
                className="demo-submit-btn"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !customInput.trim()}
              >
                {isAnalyzing ? (
                  <>
                    <span className="demo-spinner" />
                    <span>Analyzing Logic…</span>
                  </>
                ) : (
                  <>
                    <span>⚔️ Spar with AI</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Live Analysis Result */}
          {result && (
            <div className="demo-result-panel">
              <div className="demo-result-header">
                <div className="demo-score-chip">
                  <span className="score-number">{result.score}</span>
                  <span className="score-denom">/100</span>
                  <span className="score-label">Logic Rigor</span>
                </div>
                <div className="demo-result-title">
                  Round 1 AI Breakdown
                </div>
              </div>

              {/* AI Counter-Punch */}
              <div className="demo-block demo-block--counter">
                <div className="demo-block-label">
                  <span>🤖 AI Opponent Counter-Argument</span>
                </div>
                <p className="demo-block-text">{result.aiCounter}</p>
              </div>

              {/* Fallacy Breakdown */}
              <div className="demo-block demo-block--fallacies">
                <div className="demo-block-label">
                  <span>🔍 Fallacies Detected in Your Argument</span>
                </div>
                <ul className="demo-fallacies-list">
                  {result.fallacies.map((fal, i) => (
                    <li key={i} className="demo-fallacy-item">
                      <span className="demo-fallacy-badge">⚠️ Flagged</span>
                      <span>{fal}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Conversion Callout */}
              <div className="demo-cta-box">
                <div className="demo-cta-text">
                  <strong>Ready for a complete formal debate?</strong>
                  <span>Experience real-time voice sparring, Oxford and GD formats, multi-turn AI judging, and printable Report Cards.</span>
                </div>
                <button
                  className="demo-cta-action"
                  onClick={() => navigate('/register')}
                >
                  Start Free with 5 Debates Every Month →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
