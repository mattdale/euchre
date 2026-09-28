const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../storage.js');

/** Minimal in-memory stand-in for localStorage. */
function fakeStorage({ failWrites = false } = {}) {
    const map = new Map();
    return {
        map,
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => {
            if (failWrites) throw new Error('QuotaExceededError');
            map.set(k, String(v));
        },
        removeItem: k => map.delete(k)
    };
}

describe('settings', () => {
    test('defaults when nothing is stored', () => {
        const store = S.createStore(fakeStorage());
        assert.deepEqual(store.loadSettings(), S.DEFAULT_SETTINGS);
    });

    test('round-trips valid settings', () => {
        const store = S.createStore(fakeStorage());
        const settings = { winningScore: 15, stickTheDealer: false, beginnerMode: true, difficulty: 'casual' };
        store.saveSettings(settings);
        assert.deepEqual(store.loadSettings(), settings);
    });

    test('replaces invalid fields with defaults', () => {
        assert.deepEqual(
            S.sanitizeSettings({ winningScore: 99, stickTheDealer: 'yes', difficulty: 'godlike', beginnerMode: true }),
            { ...S.DEFAULT_SETTINGS, beginnerMode: true }
        );
    });

    test('survives corrupt JSON', () => {
        const storage = fakeStorage();
        storage.setItem(S.KEYS.settings, '{not json');
        assert.deepEqual(S.createStore(storage).loadSettings(), S.DEFAULT_SETTINGS);
    });
});

describe('saved game', () => {
    test('round-trips score, dealer and target', () => {
        const store = S.createStore(fakeStorage());
        assert.equal(store.saveGame({ score: [6, 4], dealer: 2, winningScore: 10 }), true);
        const game = store.loadGame();
        assert.deepEqual(game.score, [6, 4]);
        assert.equal(game.dealer, 2);
        assert.equal(game.winningScore, 10);
        assert.ok(game.savedAt > 0);
    });

    test('a finished game is not resumable and clears any older save', () => {
        const store = S.createStore(fakeStorage());
        store.saveGame({ score: [6, 4], dealer: 2, winningScore: 10 });
        assert.equal(store.saveGame({ score: [10, 4], dealer: 3, winningScore: 10 }), false);
        assert.equal(store.loadGame(), null);
    });

    test('rejects malformed saves', () => {
        assert.equal(S.sanitizeSavedGame({ score: [1], dealer: 0, winningScore: 10 }), null);
        assert.equal(S.sanitizeSavedGame({ score: [1, -1], dealer: 0, winningScore: 10 }), null);
        assert.equal(S.sanitizeSavedGame({ score: [1, 2], dealer: 4, winningScore: 10 }), null);
        assert.equal(S.sanitizeSavedGame({ score: [1, 2], dealer: 0, winningScore: 12 }), null);
        assert.equal(S.sanitizeSavedGame('nope'), null);
    });

    test('clearGame removes it', () => {
        const store = S.createStore(fakeStorage());
        store.saveGame({ score: [1, 2], dealer: 0, winningScore: 11 });
        store.clearGame();
        assert.equal(store.loadGame(), null);
    });
});

describe('stats', () => {
    const base = { ...S.DEFAULT_STATS };

    test('euchring them vs getting euchred', () => {
        assert.equal(S.recordHand(base, { makerTeam: 1, outcome: 'euchre' }).euchresDealt, 1);
        const taken = S.recordHand(base, { makerTeam: 0, outcome: 'euchre' });
        assert.equal(taken.euchresTaken, 1);
        assert.equal(taken.handsCalled, 1);
    });

    test('marches and loners only count for your team', () => {
        const loner = S.recordHand(base, { makerTeam: 0, outcome: 'loner_march' });
        assert.equal(loner.marches, 1);
        assert.equal(loner.lonersWon, 1);
        const theirs = S.recordHand(base, { makerTeam: 1, outcome: 'march' });
        assert.equal(theirs.marches, 0);
        assert.equal(theirs.handsPlayed, 1);
    });

    test('win streaks', () => {
        let s = base;
        s = S.recordGame(s, true);
        s = S.recordGame(s, true);
        s = S.recordGame(s, false);
        s = S.recordGame(s, true);
        assert.equal(s.gamesPlayed, 4);
        assert.equal(s.gamesWon, 3);
        assert.equal(s.currentStreak, 1);
        assert.equal(s.bestStreak, 2);
    });

    test('store persists and resets', () => {
        const store = S.createStore(fakeStorage());
        store.recordHand({ makerTeam: 1, outcome: 'euchre' });
        store.recordGame(true);
        assert.equal(store.loadStats().euchresDealt, 1);
        assert.equal(store.loadStats().gamesWon, 1);
        store.resetStats();
        assert.deepEqual(store.loadStats(), S.DEFAULT_STATS);
    });

    test('pure updates do not mutate their input', () => {
        const frozen = Object.freeze({ ...base });
        S.recordHand(frozen, { makerTeam: 0, outcome: 'made' });
        S.recordGame(frozen, true);
    });
});

describe('unavailable or failing storage', () => {
    test('no storage: everything still works with defaults', () => {
        const store = S.createStore(null);
        assert.equal(store.available, false);
        assert.equal(store.saveSettings({}), false);
        assert.deepEqual(store.loadSettings(), S.DEFAULT_SETTINGS);
        assert.equal(store.loadGame(), null);
        assert.equal(store.recordGame(true).gamesWon, 1);
    });

    test('quota errors on write are swallowed', () => {
        const store = S.createStore(fakeStorage({ failWrites: true }));
        assert.equal(store.saveGame({ score: [1, 1], dealer: 0, winningScore: 10 }), false);
        assert.doesNotThrow(() => store.recordHand({ makerTeam: 0, outcome: 'made' }));
    });
});
