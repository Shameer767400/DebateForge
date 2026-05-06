import React, { useState, useRef, useEffect } from 'react';
import './AnimatedPasswordInput.css';

const CharSpan = ({ char, index, total, animState, revealed }) => {
  const [isDot, setIsDot] = useState(!revealed && animState !== 'hiding');

  useEffect(() => {
    if (animState === 'revealing') {
      setIsDot(false);
    } else if (animState === 'none') {
      setIsDot(!revealed);
    } else if (animState === 'hiding') {
      setIsDot(false);
    }
  }, [animState, revealed]);

  const handleAnimationEnd = () => {
    if (animState === 'hiding') {
      setIsDot(true);
    }
  };

  let className = 'char-span';
  let delay = '0ms';

  if (animState === 'revealing') {
    className += ' animating';
    delay = `${index * 60}ms`;
  } else if (animState === 'hiding' && !isDot) {
    className += ' hiding';
    delay = `${(total - 1 - index) * 35}ms`;
  }

  return (
    <span
      className={className}
      style={{
        animationDelay: delay,
        fontSize: isDot ? '20px' : '16px',
      }}
      onAnimationEnd={handleAnimationEnd}
    >
      {isDot ? '•' : char}
    </span>
  );
};

export default function AnimatedPasswordInput({ value, onChange, className = '', id, placeholder, ...props }) {
  const [revealed, setRevealed] = useState(false);
  const [animState, setAnimState] = useState('none');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  const toggleReveal = (e) => {
    e.preventDefault();
    if (revealed) {
      setRevealed(false);
      setAnimState('hiding');
    } else {
      setRevealed(true);
      setAnimState('revealing');
    }
  };

  const handleChange = (e) => {
    setAnimState('none');
    onChange(e);
  };

  return (
    <div className="field-wrap">
      <div
        className={`char-display ${className}`}
        onClick={() => inputRef.current?.focus()}
      >
        {value.length === 0 && placeholder && !isFocused && (
          <span className="char-placeholder">{placeholder}</span>
        )}
        {value.split('').map((char, i) => (
          <CharSpan key={i} char={char} index={i} total={value.length} animState={animState} revealed={revealed} />
        ))}
        {isFocused && <span className="fake-cursor">|</span>}
      </div>
      <input
        ref={inputRef}
        id={id}
        className="real-input"
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        spellCheck="false"
        autoCapitalize="off"
        autoCorrect="off"
        {...props}
      />
      <button type="button" className="toggle-btn" onClick={toggleReveal} aria-label="Toggle password visibility" tabIndex="-1">
        {revealed ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  );
}