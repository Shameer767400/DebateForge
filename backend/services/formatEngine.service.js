'use strict';

/**
 * DebateFormatEngine — manages formal debate format rules and phase transitions.
 *
 * Supports: freeform, oxford, lincoln_douglas, parliamentary
 */

/* ═══════════════════════════════════════
   FORMAT DEFINITIONS
═══════════════════════════════════════ */

const FORMATS = {
  freeform: {
    name: 'Freeform',
    phases: [
      { key: 'opening', name: 'Open Debate', turnsEach: Infinity, timeLimit: 60 },
    ],
  },

  oxford: {
    name: 'Oxford Union',
    phases: [
      { key: 'opening',            name: 'Opening Statements',  turnsEach: 2, timeLimit: 90 },
      { key: 'rebuttal',           name: 'Rebuttals',           turnsEach: 3, timeLimit: 60 },
      { key: 'cross_examination',  name: 'Cross-Examination',   turnsEach: 2, timeLimit: 60 },
      { key: 'closing',            name: 'Closing Statements',  turnsEach: 1, timeLimit: 90 },
      { key: 'judging',            name: 'Judge Scoring',       turnsEach: 0, timeLimit: 0  },
    ],
  },

  lincoln_douglas: {
    name: 'Lincoln-Douglas',
    phases: [
      { key: 'opening',            name: 'Affirmative Constructive', turnsEach: 1, timeLimit: 180 },
      { key: 'cross_examination',  name: 'Cross-Exam by Negative',  turnsEach: 3, timeLimit: 60  },
      { key: 'rebuttal',           name: 'Negative Constructive',   turnsEach: 1, timeLimit: 210 },
      { key: 'cross_examination',  name: 'Affirmative Cross-Exam',  turnsEach: 3, timeLimit: 60  },
      { key: 'rebuttal',           name: 'Affirmative Rebuttal',    turnsEach: 1, timeLimit: 120 },
      { key: 'rebuttal',           name: 'Negative Rebuttal',       turnsEach: 1, timeLimit: 180 },
      { key: 'closing',            name: 'Affirmative Final',       turnsEach: 1, timeLimit: 90  },
      { key: 'judging',            name: 'Judge Scoring',           turnsEach: 0, timeLimit: 0   },
    ],
  },

  parliamentary: {
    name: 'British Parliamentary',
    phases: [
      { key: 'opening',   name: 'Opening Government',    turnsEach: 1, timeLimit: 210 },
      { key: 'opening',   name: 'Opening Opposition',    turnsEach: 1, timeLimit: 240 },
      { key: 'rebuttal',  name: 'Government Rebuttal',   turnsEach: 1, timeLimit: 240 },
      { key: 'rebuttal',  name: 'Opposition Rebuttal',   turnsEach: 1, timeLimit: 240 },
      { key: 'closing',   name: 'Government Summary',    turnsEach: 1, timeLimit: 120 },
      { key: 'closing',   name: 'Opposition Summary',    turnsEach: 1, timeLimit: 120 },
      { key: 'judging',   name: 'Judge Scoring',         turnsEach: 0, timeLimit: 0   },
    ],
  },
};

/* ═══════════════════════════════════════
   PHASE INSTRUCTIONS (shown to user)
═══════════════════════════════════════ */

const PHASE_INSTRUCTIONS = {
  opening:
    'State your position clearly. Present your strongest argument and set the framework for debate.',
  rebuttal:
    'Directly attack your opponent\'s specific claims. Do not introduce entirely new arguments.',
  cross_examination:
    'Ask direct, probing questions only. No speeches — questions and brief answers only.',
  closing:
    'Summarize your strongest points. This is your final chance to persuade. No new arguments.',
  judging:
    'The judge is evaluating both sides. Please wait for the verdict.',
};

/* ═══════════════════════════════════════
   AI SYSTEM PROMPT ADDITIONS PER PHASE
═══════════════════════════════════════ */

const PHASE_PROMPTS = {
  opening:
    'This is the OPENING STATEMENT phase. Present your strongest argument clearly and establish your position. Use evidence and structure your argument well.',
  rebuttal:
    'This is the REBUTTAL phase. Directly attack the specific claims made by your opponent. Reference their exact words where possible. Do not introduce entirely new arguments.',
  cross_examination:
    'This is the CROSS-EXAMINATION phase. If you are being cross-examined: answer questions directly and briefly. Do not ask questions back. If you are the examiner: ask pointed, probing questions that expose weaknesses.',
  closing:
    'This is the CLOSING STATEMENT phase. Summarize your strongest points. Reference key moments from the debate. End with a powerful final statement. No new arguments.',
  judging: '',
};

/* ═══════════════════════════════════════
   DebateFormatEngine CLASS
═══════════════════════════════════════ */

class DebateFormatEngine {
  /**
   * Get the full format definition.
   */
  static getFormat(formatName) {
    return FORMATS[formatName] || FORMATS.freeform;
  }

  /**
   * Get info about the current phase.
   * @param {string} formatName
   * @param {number} phaseIndex - index into the format's phases array
   * @returns {{ phaseName, phaseKey, timeLimit, instruction, isLastRound, nextPhaseIndex, phaseNumber, totalPhases }}
   */
  static getCurrentPhaseInfo(formatName, phaseIndex) {
    const format = this.getFormat(formatName);
    const phases = format.phases;
    const idx = Math.min(phaseIndex, phases.length - 1);
    const phase = phases[idx];

    return {
      phaseKey: phase.key,
      phaseName: phase.name,
      timeLimit: phase.timeLimit,
      instruction: PHASE_INSTRUCTIONS[phase.key] || '',
      phaseNumber: idx + 1,
      totalPhases: phases.length,
      turnsEach: phase.turnsEach,
    };
  }

  /**
   * Check if current phase should advance.
   */
  static shouldAdvancePhase(formatName, phaseIndex, roundsInPhase) {
    if (formatName === 'freeform') return false;

    const format = this.getFormat(formatName);
    const phases = format.phases;
    if (phaseIndex >= phases.length) return false;

    const phase = phases[phaseIndex];
    return roundsInPhase >= phase.turnsEach;
  }

  /**
   * Get the next phase index, or -1 if debate has ended.
   */
  static getNextPhaseIndex(formatName, phaseIndex) {
    const format = this.getFormat(formatName);
    const nextIdx = phaseIndex + 1;
    if (nextIdx >= format.phases.length) return -1; // ended
    return nextIdx;
  }

  /**
   * Get system prompt addition for current phase.
   */
  static getPhaseSystemPromptAddition(formatName, phaseIndex, userSide) {
    if (formatName === 'freeform') return '';

    const format = this.getFormat(formatName);
    const phases = format.phases;
    if (phaseIndex >= phases.length) return '';

    const phase = phases[phaseIndex];
    let addition = PHASE_PROMPTS[phase.key] || '';

    // Add phase-specific context
    addition += `\n\nCurrent phase: ${phase.name}. `;
    if (phase.key === 'cross_examination') {
      // In cross-exam, user asks questions, AI answers
      addition += 'The user is cross-examining you. Answer their questions directly and concisely.';
    }

    return addition;
  }

  /**
   * Get time limit for current phase.
   */
  static getTimeLimitForPhase(formatName, phaseIndex) {
    if (formatName === 'freeform') return 60; // default

    const format = this.getFormat(formatName);
    const phases = format.phases;
    if (phaseIndex >= phases.length) return 60;

    return phases[phaseIndex].timeLimit;
  }

  /**
   * Get user-facing phase instructions.
   */
  static getPhaseInstructions(formatName, phaseIndex) {
    if (formatName === 'freeform') return '';

    const format = this.getFormat(formatName);
    const phases = format.phases;
    if (phaseIndex >= phases.length) return '';

    const phase = phases[phaseIndex];
    return `${phase.name.toUpperCase()}: ${PHASE_INSTRUCTIONS[phase.key] || ''}`;
  }

  /**
   * Get all phase names for progress display.
   */
  static getPhaseList(formatName) {
    const format = this.getFormat(formatName);
    return format.phases.map((p, i) => ({
      key: p.key,
      name: p.name,
      index: i,
    }));
  }
}

module.exports = DebateFormatEngine;
