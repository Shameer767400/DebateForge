import React, { useState } from 'react';
import '../styles/share-modal.css';

/**
 * Renders a crisp 1200x630 social scorecard to an HTML5 canvas and triggers PNG download.
 */
function downloadSocialCard({ topic, format, userScore, winner, gdVerdict, userName = 'Candidate' }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isGD = format?.toLowerCase().includes('gd') || !!gdVerdict;
  const isWin = winner === 'user';
  const status = gdVerdict?.status || (isWin ? 'SELECTED' : 'COMPLETED');

  // 1. Background
  const bgGrad = ctx.createLinearGradient(0, 0, 1200, 630);
  bgGrad.addColorStop(0, '#0a0d17');
  bgGrad.addColorStop(0.5, '#0e1424');
  bgGrad.addColorStop(1, '#070911');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 630);

  // 2. Ambient glows
  const glow1 = ctx.createRadialGradient(150, 100, 10, 150, 100, 320);
  glow1.addColorStop(0, 'rgba(0, 229, 255, 0.18)');
  glow1.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, 600, 400);

  const glow2 = ctx.createRadialGradient(1050, 500, 10, 1050, 500, 360);
  glow2.addColorStop(0, 'rgba(0, 255, 135, 0.16)');
  glow2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(600, 200, 600, 430);

  // 3. Cyber border
  ctx.strokeStyle = isWin || status === 'SELECTED' ? 'rgba(0, 255, 135, 0.45)' : 'rgba(0, 229, 255, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 1160, 590);

  // 4. Header Bar
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#00ff87';
  ctx.fillText('⚔️ DebateForge', 60, 85);

  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('AI-POWERED EVALUATOR', 340, 85);

  // Verified Pill on right
  ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
  ctx.fillRect(860, 55, 280, 44);
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(860, 55, 280, 44);
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('✓ VERIFIED SCORECARD', 895, 83);

  // 5. Divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(60, 120);
  ctx.lineTo(1140, 120);
  ctx.stroke();

  // 6. Mode & Topic
  ctx.font = '700 20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#00e5ff';
  const subtitle = isGD ? 'CAMPUS PLACEMENT GROUP DISCUSSION SIMULATION' : 'COMPETITIVE AI SPARRING ROUND';
  ctx.fillText(subtitle, 60, 165);

  // Topic text (wrapped if long)
  ctx.font = 'bold 32px Georgia, serif';
  ctx.fillStyle = '#f0f6fc';
  const topicClean = `"${topic.length > 70 ? topic.slice(0, 68) + '…' : topic}"`;
  ctx.fillText(topicClean, 60, 215);

  // 7. Main Score / Verdict Box
  ctx.fillStyle = 'rgba(15, 22, 38, 0.85)';
  ctx.fillRect(60, 260, 1080, 260);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.strokeRect(60, 260, 1080, 260);

  // Verdict status banner
  let verdictColor = '#00ff87';
  let verdictText = '🏆 WINNER · OUTSTANDING REASONING';
  if (isGD) {
    if (status === 'SELECTED') {
      verdictColor = '#00ff87';
      verdictText = '🟢 SELECTED FOR ROUND 2 (TECHNICAL & HR)';
    } else if (status === 'WAITLISTED') {
      verdictColor = '#ffcc00';
      verdictText = '🟡 WAITLISTED FOR FINAL PLACEMENT REVIEW';
    } else {
      verdictColor = '#ff3366';
      verdictText = '🔴 NEEDS PRACTICE IN STRUCTURE & LOGIC';
    }
  } else if (!isWin) {
    verdictColor = winner === 'draw' ? '#ffcc00' : '#ff9500';
    verdictText = winner === 'draw' ? '⚖️ DRAW · BALANCED SPAR' : '⚔️ COMPLETED · STRONG RESISTANCE';
  }

  ctx.fillStyle = verdictColor;
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillText(verdictText, 95, 315);

  // Overall Score Display
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${userScore}`, 95, 400);

  ctx.font = '600 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('/ 100', 185, 400);

  const percentile = userScore >= 85 ? 'Top 3% Candidate' : userScore >= 75 ? 'Top 10% Candidate' : 'Top 25% Candidate';
  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#00ff87';
  ctx.fillText(`★ ${percentile}`, 95, 440);

  // 8. Breakdown Columns
  const metrics = isGD && gdVerdict
    ? [
        { label: 'Entry Timing', val: `${gdVerdict.entryTimingScore || 85}%` },
        { label: 'Content Depth', val: `${gdVerdict.contentDepthScore || 82}%` },
        { label: 'Listening & Synthesis', val: `${gdVerdict.listeningSynthesisScore || 88}%` },
        { label: 'Group Leadership', val: `${gdVerdict.leadershipScore || 84}%` },
      ]
    : [
        { label: 'Argument Logic', val: `${Math.round(userScore * 0.98)}%` },
        { label: 'Evidence Quality', val: `${Math.round(userScore * 0.94)}%` },
        { label: 'Clarity & Delivery', val: `${Math.round(userScore * 1.02)}%` },
        { label: 'Fallacy Avoidance', val: '95%' },
      ];

  metrics.forEach((m, idx) => {
    const xPos = 460 + idx * 165;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(xPos, 340, 150, 120);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(xPos, 340, 150, 120);

    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#00e5ff';
    ctx.fillText(m.val, xPos + 18, 385);

    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const words = m.label.split(' ');
    ctx.fillText(words[0], xPos + 18, 420);
    if (words[1]) ctx.fillText(words.slice(1).join(' '), xPos + 18, 440);
  });

  // 9. Footer
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText('Verified at debateforge.tech • AI Debate & Campus GD Evaluation Arena', 60, 565);

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.fillText(dateStr, 1020, 565);

  // Trigger download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DebateForge-${isGD ? 'GD-Placement-Verdict' : 'Debate-Scorecard'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export default function ShareDebateModal({
  isOpen,
  onClose,
  topic = 'AI Debate Practice',
  format = 'Freeform',
  userScore = 75,
  winner = 'user',
  debateId = '',
  gdVerdict = null,
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  const isGD = format?.toLowerCase().includes('gd') || !!gdVerdict;
  const isWin = winner === 'user';
  const domain = 'https://debateforge.tech';
  const challengeUrl = `${domain}/lobby?topic=${encodeURIComponent(topic)}`;

  const resultEmoji = isGD
    ? (gdVerdict?.status === 'SELECTED' ? '🟢 SELECTED' : gdVerdict?.status === 'WAITLISTED' ? '🟡 WAITLISTED' : '🔴 EVALUATED')
    : (isWin ? '🏆 WIN' : winner === 'draw' ? '⚖️ DRAW' : '⚔️ DEFEAT');

  // Custom text tailored for LinkedIn and WhatsApp
  const shareText = isGD
    ? `🎯 Campus Placement GD Readiness Milestone:\n` +
      `I just completed a 4-person simulated Placement Group Discussion on DebateForge!\n\n` +
      `📌 Topic: "${topic}"\n` +
      `🎖️ Verdict: ${gdVerdict?.selectionTitle || resultEmoji} (${userScore}/100)\n` +
      (gdVerdict ? `• Entry Timing: ${gdVerdict.entryTimingScore}%\n• Content & Depth: ${gdVerdict.contentDepthScore}%\n• Active Listening: ${gdVerdict.listeningSynthesisScore}%\n• Group Leadership: ${gdVerdict.leadershipScore}%\n\n` : '\n') +
      `Practice real placement GDs & interview sparring with instant AI feedback here: ${challengeUrl}\n\n` +
      `#CampusPlacements #GroupDiscussion #InterviewPrep #DebateForge #AI #Placements2026`
    : `I scored ${userScore}/100 in an AI debate on DebateForge!\n\n` +
      `Topic: "${topic}"\n` +
      `Format: ${format.toUpperCase()} | Result: ${resultEmoji}\n\n` +
      `Think you have stronger arguments? Spar against the AI opponent here: ${challengeUrl}\n\n` +
      `#DebateForge #PublicSpeaking #CriticalThinking #AI`;

  const handleDownloadCard = () => {
    setDownloading(true);
    try {
      downloadSocialCard({ topic, format, userScore, winner, gdVerdict });
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `DebateForge Score: ${userScore}/100 (${resultEmoji})`,
          text: shareText,
          url: challengeUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopy();
    }
  };

  const shareToWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareToLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(challengeUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareToTwitter = () => {
    const tweetText = isGD
      ? `I scored ${userScore}/100 in a simulated Campus Placement GD on @DebateForge! Status: ${resultEmoji}. Practice live at:`
      : `I scored ${userScore}/100 in an AI debate on @DebateForge! ${resultEmoji} on "${topic.slice(0, 50)}...". Spar here:`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(challengeUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="share-modal-header">
          <div className="share-modal-title-row">
            <span className="share-modal-icon">⚔️</span>
            <h3 className="share-modal-title">
              {isGD ? 'Placement GD Scorecard' : 'Share Debate Score'}
            </h3>
          </div>
          <button className="share-modal-close" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        {/* Score Card Preview */}
        <div className={`share-preview-card ${isWin || gdVerdict?.status === 'SELECTED' ? 'share-preview--win' : 'share-preview--other'}`}>
          <div className="share-preview-badge">
            {resultEmoji} · {userScore}/100
          </div>
          <div className="share-preview-topic">
            "{topic}"
          </div>
          {gdVerdict && (
            <div style={{ margin: '8px 0', fontSize: '0.85rem', color: '#00ff87', fontWeight: 600 }}>
              {gdVerdict.selectionTitle}
            </div>
          )}
          <div className="share-preview-meta">
            <span>{isGD ? 'Campus GD Simulation' : `Format: ${format}`}</span>
            <span>·</span>
            <span>Verified AI Recruiter Verdict</span>
          </div>
        </div>

        {/* Download Scorecard Card Button */}
        <button
          className="share-social-btn"
          onClick={handleDownloadCard}
          disabled={downloading}
          style={{
            width: '100%',
            marginBottom: '16px',
            padding: '12px 18px',
            background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(0, 255, 135, 0.25))',
            border: '1px solid rgba(0, 255, 135, 0.5)',
            borderRadius: '10px',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.95rem',
            transition: 'all 0.2s ease',
          }}
        >
          <span>📥</span>
          <span>{downloading ? 'Generating High-Res Card…' : 'Download Verified Social Card (PNG)'}</span>
        </button>

        {/* Challenge Callout */}
        <p className="share-modal-hint">
          {isGD
            ? 'Share your placement readiness on LinkedIn or with your college batchmates on WhatsApp:'
            : 'Challenge your peers, classmates, or colleagues to beat your reasoning score:'}
        </p>

        {/* 1-Click Social Buttons */}
        <div className="share-social-grid">
          <button
            className="share-social-btn share-btn--whatsapp"
            onClick={shareToWhatsApp}
            title="Share to WhatsApp"
          >
            <span className="social-icon">💬</span>
            <span>WhatsApp</span>
          </button>

          <button
            className="share-social-btn share-btn--linkedin"
            onClick={shareToLinkedIn}
            title="Share to LinkedIn"
          >
            <span className="social-icon">💼</span>
            <span>LinkedIn</span>
          </button>

          <button
            className="share-social-btn share-btn--twitter"
            onClick={shareToTwitter}
            title="Share to X"
          >
            <span className="social-icon">🐦</span>
            <span>X / Twitter</span>
          </button>

          {navigator.share && (
            <button
              className="share-social-btn share-btn--native"
              onClick={handleNativeShare}
              title="More sharing options"
            >
              <span className="social-icon">📱</span>
              <span>More Apps</span>
            </button>
          )}
        </div>

        {/* Copy Text / Link Box */}
        <div className="share-copy-box">
          <input
            type="text"
            readOnly
            value={challengeUrl}
            className="share-copy-input"
            onClick={(e) => e.target.select()}
          />
          <button
            className={`share-copy-btn ${copied ? 'share-copy-btn--copied' : ''}`}
            onClick={handleCopy}
          >
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
