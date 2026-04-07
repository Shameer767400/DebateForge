const { updateStreak } = require('./services/streak.service');

function runTest() {
  console.log('--- Testing Streak Logic ---');

  // Case 1: First debate
  let user = { username: 'testuser', streak: { current: 0, longest: 0, lastDebateDate: null, freezeUsed: false } };
  let result = updateStreak(user);
  console.log('Case 1 (First debate):', user.streak.current === 1 ? 'PASS' : 'FAIL', user.streak);

  // Case 2: Same day debate
  result = updateStreak(user);
  console.log('Case 2 (Same day):', user.streak.current === 1 ? 'PASS' : 'FAIL', user.streak);

  // Case 3: Next day debate
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  user.streak.lastDebateDate = yesterday;
  result = updateStreak(user);
  console.log('Case 3 (Next day):', user.streak.current === 2 ? 'PASS' : 'FAIL', user.streak);

  // Case 4: Missed a day, use freeze
  const dayBeforeYesterday = new Date();
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
  user.streak.lastDebateDate = dayBeforeYesterday;
  user.streak.freezeUsed = false;
  user.streak.current = 2; // resetting for test
  result = updateStreak(user);
  console.log('Case 4 (Missed 1 day, freeze):', user.streak.current === 3 ? 'PASS' : 'FAIL', user.streak, 'Freeze used:', result.freezeUsed);

  // Case 5: Missed more than 2 days
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  user.streak.lastDebateDate = threeDaysAgo;
  result = updateStreak(user);
  console.log('Case 5 (Streak broken):', user.streak.current === 1 ? 'PASS' : 'FAIL', user.streak);
}

runTest();
