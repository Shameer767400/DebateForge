const { updateStreak } = require('../services/streak.service');

function todayStrFor(nowIso, tzOffsetMinutes) {
  const now = new Date(nowIso);
  const localMs = now.getTime() + tzOffsetMinutes * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

function ymdToUtcMidnightDate(ymd) {
  // ymd is already in YYYY-MM-DD form (UTC date string), store as UTC midnight.
  return new Date(`${ymd}T00:00:00Z`);
}

describe('streak.service updateStreak timezone behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('first debate initializes streak to 1', () => {
    jest.setSystemTime(new Date('2026-05-07T10:00:00Z'));

    const user = { streak: { current: 0, longest: 0, lastDebateDate: null, freezeUsed: false } };
    const result = updateStreak(user, 0);

    expect(result.streakUpdated).toBe(true);
    expect(user.streak.current).toBe(1);
    expect(user.streak.longest).toBe(1);
    expect(user.streak.lastDebateDate).toBeInstanceOf(Date);
  });

  test('increments on consecutive local days (diffDays=1)', () => {
    const tz = 330; // IST
    const nowIso = '2026-05-08T23:00:00Z'; // local day depends on tz
    jest.setSystemTime(new Date(nowIso));

    const todayStr = todayStrFor(nowIso, tz);
    const todayDate = ymdToUtcMidnightDate(todayStr);
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const user = {
      streak: {
        current: 1,
        longest: 1,
        lastDebateDate: yesterdayDate,
        freezeUsed: false,
      },
    };

    const result = updateStreak(user, tz);
    expect(result.streakUpdated).toBe(true);
    expect(result.newStreak).toBe(2);
    expect(user.streak.current).toBe(2);
    expect(user.streak.freezeUsed).toBe(false);
  });

  test('uses freeze when missed exactly one local day (diffDays=2, freezeUsed=false)', () => {
    const tz = -300; // EST
    const nowIso = '2026-05-08T05:00:00Z';
    jest.setSystemTime(new Date(nowIso));

    const todayStr = todayStrFor(nowIso, tz);
    const todayDate = ymdToUtcMidnightDate(todayStr);
    const twoAgoDate = new Date(todayDate);
    twoAgoDate.setUTCDate(twoAgoDate.getUTCDate() - 2);
    const twoAgoStr = twoAgoDate.toISOString().slice(0, 10);

    const user = {
      streak: {
        current: 3,
        longest: 3,
        lastDebateDate: ymdToUtcMidnightDate(twoAgoStr),
        freezeUsed: false,
      },
    };

    const result = updateStreak(user, tz);
    expect(result.streakUpdated).toBe(true);
    expect(result.freezeUsed).toBe(true);
    expect(user.streak.current).toBe(4);
    expect(user.streak.freezeUsed).toBe(true);
  });

  test('no change if already debated on the same local day (diffDays=0)', () => {
    const tz = 0;
    const nowIso = '2026-05-07T10:15:00Z';
    jest.setSystemTime(new Date(nowIso));

    const todayStr = todayStrFor(nowIso, tz);
    const userDate = ymdToUtcMidnightDate(todayStr);

    const user = {
      streak: {
        current: 5,
        longest: 5,
        lastDebateDate: userDate,
        freezeUsed: false,
      },
    };

    const result = updateStreak(user, tz);
    expect(result.streakUpdated).toBe(false);
    expect(user.streak.current).toBe(5);
    expect(user.streak.freezeUsed).toBe(false);
  });
});

