/**
 * Persistence for settings, the game in progress, lifetime stats and
 * "How to Play" lesson progress.
 *
 * Everything goes through `createStore(storage)`, where `storage` is anything
 * with getItem/setItem/removeItem (localStorage in the browser, a Map-backed
 * fake in tests). Reads validate what they find and fall back to defaults, so
 * a corrupted or hand-edited value can never break the game. Writes swallow
 * quota and privacy-mode errors: losing a save is better than losing a game.
 *
 * Works as a classic <script> (attaches to `window.EuchreStorage`) and as a
 * CommonJS module.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EuchreStorage = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PREFIX = 'euchre:v1:';
    const KEYS = Object.freeze({
        settings: PREFIX + 'settings',
        game: PREFIX + 'game',
        stats: PREFIX + 'stats',
        tutorial: PREFIX + 'tutorial'
    });

    const WINNING_SCORES = Object.freeze([10, 11, 15]);
    const DIFFICULTIES = Object.freeze(['casual', 'intermediate', 'intense']);

    const DEFAULT_SETTINGS = Object.freeze({
        winningScore: 10,
        stickTheDealer: true,
        beginnerMode: false,
        difficulty: 'intense'
    });

    const DEFAULT_STATS = Object.freeze({
        gamesPlayed: 0,
        gamesWon: 0,
        handsPlayed: 0,
        handsCalled: 0, // hands where your team made trump
        euchresDealt: 0, // you euchred them
        euchresTaken: 0, // they euchred you
        marches: 0, // your team took all five as makers
        lonersWon: 0, // your team marched alone
        currentStreak: 0,
        bestStreak: 0
    });

    const isInt = n => Number.isInteger(n) && n >= 0;

    // ─── Validation (pure) ───────────────────────────────────────────────

    function sanitizeSettings(raw) {
        const s = raw && typeof raw === 'object' ? raw : {};
        return {
            winningScore: WINNING_SCORES.includes(s.winningScore) ? s.winningScore : DEFAULT_SETTINGS.winningScore,
            stickTheDealer: typeof s.stickTheDealer === 'boolean' ? s.stickTheDealer : DEFAULT_SETTINGS.stickTheDealer,
            beginnerMode: typeof s.beginnerMode === 'boolean' ? s.beginnerMode : DEFAULT_SETTINGS.beginnerMode,
            difficulty: DIFFICULTIES.includes(s.difficulty) ? s.difficulty : DEFAULT_SETTINGS.difficulty
        };
    }

    /** A saved game is only valid if nobody has already won it. Returns null otherwise. */
    function sanitizeSavedGame(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const { score, dealer, winningScore, savedAt } = raw;
        if (!Array.isArray(score) || score.length !== 2 || !score.every(isInt)) return null;
        if (!Number.isInteger(dealer) || dealer < 0 || dealer > 3) return null;
        if (!WINNING_SCORES.includes(winningScore)) return null;
        if (score[0] >= winningScore || score[1] >= winningScore) return null;
        return { score: [score[0], score[1]], dealer, winningScore, savedAt: Number(savedAt) || 0 };
    }

    function sanitizeStats(raw) {
        const s = raw && typeof raw === 'object' ? raw : {};
        const out = {};
        for (const key of Object.keys(DEFAULT_STATS)) out[key] = isInt(s[key]) ? s[key] : DEFAULT_STATS[key];
        return out;
    }

    /** Lesson progress: the ids of finished tutorial levels, deduplicated. */
    function sanitizeTutorial(raw) {
        const ids = raw && Array.isArray(raw.completed) ? raw.completed : [];
        const completed = [...new Set(ids.filter(id => typeof id === 'string' && /^[a-z0-9-]{1,32}$/.test(id)))];
        return { completed: completed.slice(0, 50) };
    }

    // ─── Stat updates (pure) ─────────────────────────────────────────────

    /**
     * Fold one finished hand into the stats. `result` comes from
     * EuchreRules.scoreHand plus the maker team; team 0 is always you.
     */
    function recordHand(stats, { makerTeam, outcome }) {
        const next = { ...stats, handsPlayed: stats.handsPlayed + 1 };
        const youCalled = makerTeam === 0;
        if (youCalled) next.handsCalled++;
        if (outcome === 'euchre') {
            if (youCalled) next.euchresTaken++;
            else next.euchresDealt++;
        } else if (youCalled && outcome === 'march') {
            next.marches++;
        } else if (youCalled && outcome === 'loner_march') {
            next.marches++;
            next.lonersWon++;
        }
        return next;
    }

    function recordGame(stats, youWon) {
        const currentStreak = youWon ? stats.currentStreak + 1 : 0;
        return {
            ...stats,
            gamesPlayed: stats.gamesPlayed + 1,
            gamesWon: stats.gamesWon + (youWon ? 1 : 0),
            currentStreak,
            bestStreak: Math.max(stats.bestStreak, currentStreak)
        };
    }

    // ─── Store ───────────────────────────────────────────────────────────

    /** localStorage if it works here, otherwise null (private mode, sandboxed iframe, file:// in some browsers). */
    function getBrowserStorage() {
        try {
            const ls = globalThis.localStorage;
            const probe = PREFIX + 'probe';
            ls.setItem(probe, '1');
            ls.removeItem(probe);
            return ls;
        } catch (_) {
            return null;
        }
    }

    function createStore(storage = getBrowserStorage()) {
        const read = key => {
            if (!storage) return null;
            try {
                const raw = storage.getItem(key);
                return raw == null ? null : JSON.parse(raw);
            } catch (_) {
                return null;
            }
        };
        const write = (key, value) => {
            if (!storage) return false;
            try {
                storage.setItem(key, JSON.stringify(value));
                return true;
            } catch (_) {
                return false;
            }
        };
        const remove = key => {
            if (!storage) return;
            try { storage.removeItem(key); } catch (_) { /* ignore */ }
        };

        return Object.freeze({
            available: !!storage,

            loadSettings: () => sanitizeSettings(read(KEYS.settings)),
            saveSettings: settings => write(KEYS.settings, sanitizeSettings(settings)),

            loadGame: () => sanitizeSavedGame(read(KEYS.game)),
            saveGame: ({ score, dealer, winningScore }) => {
                const game = sanitizeSavedGame({ score, dealer, winningScore, savedAt: Date.now() });
                if (game) return write(KEYS.game, game);
                remove(KEYS.game);
                return false;
            },
            clearGame: () => remove(KEYS.game),

            loadStats: () => sanitizeStats(read(KEYS.stats)),
            recordHand: result => {
                const next = recordHand(sanitizeStats(read(KEYS.stats)), result);
                write(KEYS.stats, next);
                return next;
            },
            recordGame: youWon => {
                const next = recordGame(sanitizeStats(read(KEYS.stats)), youWon);
                write(KEYS.stats, next);
                return next;
            },
            resetStats: () => {
                remove(KEYS.stats);
                return { ...DEFAULT_STATS };
            },

            loadTutorial: () => sanitizeTutorial(read(KEYS.tutorial)),
            completeTutorialLevel: id => {
                const current = sanitizeTutorial(read(KEYS.tutorial));
                const next = sanitizeTutorial({ completed: [...current.completed, id] });
                write(KEYS.tutorial, next);
                return next;
            }
        });
    }

    return Object.freeze({
        KEYS,
        DEFAULT_SETTINGS,
        DEFAULT_STATS,
        sanitizeSettings,
        sanitizeSavedGame,
        sanitizeStats,
        sanitizeTutorial,
        recordHand,
        recordGame,
        createStore
    });
});
