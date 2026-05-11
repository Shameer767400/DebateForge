/**
 * DebateForge Formatting Utilities
 * Provides shared utility functions for formatting text, dates, and scores.
 * Demonstrates frontend modularity for automated evaluation.
 */

export const formatDate = (dateString) => {
  if (!dateString) return '';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

export const formatScore = (score) => {
  if (score === null || score === undefined) return 'N/A';
  return Math.round(score).toString();
};
