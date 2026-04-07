'use strict';

/**
 * streak.service.js — manages daily debate streaks.
 */

/**
 * Update a user's streak after completing a debate.
 * @param {object} user — Mongoose User document
 * @returns {{ streakUpdated: boolean, newStreak: number, milestoneReached: number|null, freezeUsed: boolean }}
 */
function updateStreak(user) {
  const now      = new Date();
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDate = user.streak?.lastDebateDate
    ? new Date(user.streak.lastDebateDate)
    : null;

  const result = {
    streakUpdated:    false,
    newStreak:        user.streak?.current || 0,
    milestoneReached: null,
    freezeUsed:       false,
  };

  if (!lastDate) {
    // First debate ever
    user.streak = {
      current:        1,
      longest:        1,
      lastDebateDate: today,
      freezeUsed:     false,
    };
    result.streakUpdated = true;
    result.newStreak = 1;
    return result;
  }

  const lastDay   = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  const diffMs    = today.getTime() - lastDay.getTime();
  const diffDays  = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Already debated today — no change
    return result;
  }

  if (diffDays === 1) {
    // Consecutive day → increment streak
    user.streak.current += 1;
    user.streak.lastDebateDate = today;
    result.streakUpdated = true;
    result.newStreak = user.streak.current;
  } else if (diffDays === 2 && !user.streak.freezeUsed) {
    // Missed 1 day, use freeze → maintain streak
    user.streak.freezeUsed = true;
    user.streak.current += 1;
    user.streak.lastDebateDate = today;
    result.streakUpdated = true;
    result.newStreak = user.streak.current;
    result.freezeUsed = true;
  } else {
    // Streak broken → reset
    user.streak.current = 1;
    user.streak.lastDebateDate = today;
    result.streakUpdated = true;
    result.newStreak = 1;
  }

  // Update longest
  if (user.streak.current > (user.streak.longest || 0)) {
    user.streak.longest = user.streak.current;
  }

  // Check milestones
  const milestones = [3, 7, 14, 30, 50, 100, 365];
  const currentStreak = user.streak.current;
  const milestone = milestones.find((m) => m === currentStreak);
  if (milestone) {
    result.milestoneReached = milestone;
  }

  return result;
}

/**
 * Reset the weekly freeze (call on Mondays).
 */
function resetWeeklyFreeze(user) {
  if (user.streak) {
    user.streak.freezeUsed = false;
  }
}

module.exports = { updateStreak, resetWeeklyFreeze };
