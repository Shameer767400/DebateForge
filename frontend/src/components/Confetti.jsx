import React, { useEffect, useState } from 'react';

/**
 * Confetti – Pure CSS confetti burst.
 * Renders 60 tiny colored squares that scatter and fade.
 * Self-removes after 3 seconds.
 */
export default function Confetti() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const COLORS = ['#00ff87', '#ffcc00', '#ff3366', '#00aaff', '#ff66cc', '#66ffcc'];

  return (
    <div className="confetti-container" aria-hidden="true">
      {[...Array(60)].map((_, i) => {
        const color = COLORS[i % COLORS.length];
        const left = `${Math.random() * 100}%`;
        const delay = `${Math.random() * 0.8}s`;
        const duration = `${1.5 + Math.random() * 2}s`;
        const size = `${6 + Math.random() * 6}px`;
        const rotation = `${Math.random() * 360}deg`;

        return (
          <div
            key={i}
            className="confetti-piece"
            style={{
              left,
              width: size,
              height: size,
              background: color,
              animationDelay: delay,
              animationDuration: duration,
              transform: `rotate(${rotation})`,
            }}
          />
        );
      })}
    </div>
  );
}
