import React, { useEffect, useState } from 'react';
import '../styles/streak.css';

export default function StreakCelebration({ milestone, freezeUsed, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (milestone || freezeUsed) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [milestone, freezeUsed, onDismiss]);

  if (!visible) return null;

  return (
    <div className="streak-celebration">
      <div className="streak-celebration-card">
        {freezeUsed ? (
          <>
            <div className="streak-celebration-emoji">❄️</div>
            <div className="streak-celebration-title">Streak Freeze Used!</div>
            <div className="streak-celebration-desc">
              Your streak was saved! You missed a day, but the freeze kept it alive.
            </div>
          </>
        ) : (
          <>
            <div className="streak-celebration-emoji">🔥</div>
            <div className="streak-celebration-title">
              {milestone}-Day Streak!
            </div>
            <div className="streak-celebration-desc">
              {milestone >= 100
                ? "You're a debate legend! Incredible commitment!"
                : milestone >= 30
                ? 'A whole month of debating! Outstanding dedication!'
                : milestone >= 14
                ? 'Two weeks strong! Your skills are sharpening fast!'
                : milestone >= 7
                ? 'One week streak! The habit is forming!'
                : 'Great start! Keep the momentum going!'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
