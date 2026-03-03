/**
 * Shared application constants.
 * Import from here instead of hardcoding magic numbers throughout the codebase.
 */

/* ── Debate scoring thresholds ── */
const SCORE_THRESHOLDS = {
  WIN:  60,  // avgScore >= WIN  → user wins
  DRAW: 40,  // avgScore >= DRAW → draw; below → AI wins
};

/* ── Debate config ── */
const MAX_ROUNDS = 6;

/* ── Achievement keys ── */
const ACHIEVEMENTS = {
  FIRST_DEBATE:         'first_debate',
  TEN_WINS:             '10_wins',
  LOGIC_MASTER:         'logic_master',
  EVIDENCE_KING:        'evidence_king',
  NO_FALLACY_STREAK_3:  'no_fallacy_streak_3',
  COMEBACK_KING:        'comeback_king',
};

/* ── ELO config ── */
const AI_ELO_RATING = 1200;

module.exports = {
  SCORE_THRESHOLDS,
  MAX_ROUNDS,
  ACHIEVEMENTS,
  AI_ELO_RATING,
};
