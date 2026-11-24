import React, { useState } from 'react';
import '../styles/share-modal.css';

export default function ShareDebateModal({
  isOpen,
  onClose,
  topic = 'AI Debate Practice',
  format = 'Freeform',
  userScore = 75,
  winner = 'user',
  debateId = '',
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isWin = winner === 'user';
  const resultEmoji = isWin ? '🏆 WIN' : winner === 'draw' ? '⚖️ DRAW' : '⚔️ DEFEAT';
  const domain = 'https://www.debateforge.tech';
  const challengeUrl = `${domain}/lobby?topic=${encodeURIComponent(topic)}`;

  const shareText = `I scored ${userScore}/100 in an AI debate on DebateForge!\n\n` +
    `Topic: "${topic}"\n` +
    `Format: ${format.toUpperCase()} | Result: ${resultEmoji}\n\n` +
    `Think you have stronger arguments? Spar against the AI opponent here: ${challengeUrl}`;

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

  const shareToTwitter = () => {
    const tweetText = `I scored ${userScore}/100 in an AI debate on @DebateForge! ${resultEmoji} on "${topic.slice(0, 50)}...". Think you can argue better?`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(challengeUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareToLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(challengeUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="share-modal-header">
          <div className="share-modal-title-row">
            <span className="share-modal-icon">⚔️</span>
            <h3 className="share-modal-title">Share Your Debate Score</h3>
          </div>
          <button className="share-modal-close" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        {/* Score Card Preview */}
        <div className={`share-preview-card ${isWin ? 'share-preview--win' : 'share-preview--other'}`}>
          <div className="share-preview-badge">
            {resultEmoji} · {userScore}/100
          </div>
          <div className="share-preview-topic">
            "{topic}"
          </div>
          <div className="share-preview-meta">
            <span>Format: {format}</span>
            <span>·</span>
            <span>AI Verified Verdict</span>
          </div>
        </div>

        {/* Challenge Callout */}
        <p className="share-modal-hint">
          Challenge your peers, classmates, or colleagues to beat your reasoning score:
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
