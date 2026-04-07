import React from 'react';
import '../styles/streak.css';

const MILESTONES = [3, 7, 14, 30, 50, 100, 365];

export default function StreakBadge({ streak }) {
  const current = streak?.current || 0;
  const longest = streak?.longest || 0;
  const freezeUsed = streak?.freezeUsed || false;

  const nextMilestone = MILESTONES.find((m) => m > current) || MILESTONES[MILESTONES.length - 1];
  const progress = Math.min((current / nextMilestone) * 100, 100);

  return (
    <div className="streak-badge">
      <div className="streak-flame-row">
        <span className={`streak-flame ${current > 0 ? 'streak-flame--active' : ''}`}>
          🔥
        </span>
        <span className="streak-number">{current}</span>
        <span className="streak-label">day streak</span>
      </div>

      <div className="streak-meta">
        <span className="streak-longest">Best: {longest} days</span>
        {!freezeUsed && current > 0 && (
          <span className="streak-freeze" title="Streak freeze available — saves your streak if you miss 1 day">
            ❄️ Freeze ready
          </span>
        )}
        {freezeUsed && (
          <span className="streak-freeze streak-freeze--used" title="Freeze already used this week">
            ❄️ Freeze used
          </span>
        )}
      </div>

      {/* Milestone progress bar */}
      <div className="streak-milestone">
        <div className="streak-milestone-bar">
          <div
            className="streak-milestone-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="streak-milestone-label">
          {current >= nextMilestone ? `🎉 ${nextMilestone}-day milestone!` : `${current}/${nextMilestone} to next milestone`}
        </span>
      </div>
    </div>
  );
}
