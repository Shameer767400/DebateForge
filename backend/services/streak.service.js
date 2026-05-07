'use strict';

/**
 * streak.service.js — manages daily debate streaks.
 *
 * FIX: All date comparisons now use UTC ISO date strings (YYYY-MM-DD)
 * to avoid server-timezone / DST bleed. The client passes
 * tzOffsetMinutes so streaks reset at the user's local midnight.
 */

/**
 * Get the user-local date string in UTC (YYYY-MM-DD).
 * @param {number} tzOffsetMinutes - e.g. +330 for IST, -300 for EST
 */
function getTodayString(tzOffsetMinutes = 0) {
  const now = new Date();
  // Shift the UTC clock by the user's offset to get their local date
  const localMs = now.getTime() + tzOffsetMinutes * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/**
 * Normalise any stored Date / string to a 'YYYY-MM-DD' UTC string.
 */
function toDateString(date) {
  if (!date) return null;
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Day-difference between two 'YYYY-MM-DD' strings (integer, ≥ 0).
 */
function daysBetween(a, b) {
  const msA = new Date(a + 'T00:00:00Z').getTime();
  const msB = new Date(b + 'T00:00:00Z').getTime();
  return Math.round(Math.abs(msA - msB) / 86_400_000);
}

/**
 * Update a user's streak after completing a debate.
 * @param {object} user            — Mongoose User document
 * @param {number} tzOffsetMinutes — client's UTC offset in minutes (default 0 = UTC)
 * @returns {{ streakUpdated, newStreak, milestoneReached, freezeUsed }}
 */
function updateStreak(user, tzOffsetMinutes = 0) {
  const todayStr = getTodayString(tzOffsetMinutes);
  const lastStr  = toDateString(user.streak?.lastDebateDate);

  const result = {
    streakUpdated:    false,
    newStreak:        user.streak?.current || 0,
    milestoneReached: null,
    freezeUsed:       false,
  };

  if (!lastStr) {
    // First debate ever
    user.streak = {
      current:        1,
      longest:        1,
      lastDebateDate: new Date(todayStr + 'T00:00:00Z'),
      freezeUsed:     false,
    };
    result.streakUpdated = true;
    result.newStreak = 1;
    return result;
  }

  const diffDays = daysBetween(todayStr, lastStr);

  if (diffDays === 0) {
    // Already debated on this calendar day — no change
    return result;
  }

  if (diffDays === 1) {
    // Consecutive day → increment streak
    user.streak.current += 1;
    user.streak.lastDebateDate = new Date(todayStr + 'T00:00:00Z');
    result.streakUpdated = true;
    result.newStreak = user.streak.current;

  } else if (diffDays === 2 && !user.streak.freezeUsed) {
    // Missed exactly 1 day → use freeze
    user.streak.freezeUsed = true;
    user.streak.current += 1;
    user.streak.lastDebateDate = new Date(todayStr + 'T00:00:00Z');
    result.streakUpdated = true;
    result.newStreak = user.streak.current;
    result.freezeUsed = true;

  } else {
    // Streak broken
    user.streak.current = 1;
    user.streak.lastDebateDate = new Date(todayStr + 'T00:00:00Z');
    result.streakUpdated = true;
    result.newStreak = 1;
  }

  // Update longest
  if (user.streak.current > (user.streak.longest || 0)) {
    user.streak.longest = user.streak.current;
  }

  // Check milestones
  const milestones = [3, 7, 14, 30, 50, 100, 365];
  const milestone  = milestones.find((m) => m === user.streak.current);
  if (milestone) result.milestoneReached = milestone;

  return result;
}

/**
 * Reset the weekly freeze (call on Mondays or weekly cron).
 */
function resetWeeklyFreeze(user) {
  if (user.streak) {
    user.streak.freezeUsed = false;
  }
}

module.exports = { updateStreak, resetWeeklyFreeze, getTodayString, toDateString, daysBetween };
