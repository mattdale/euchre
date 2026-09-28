/**
 * Euchre rules engine.
 *
 * Pure functions only: no DOM, no timers, no global game state. Everything the
 * browser game needs to decide "is this legal?", "who won?" and "how many
 * points?" lives here so it can be unit tested in Node (see tests/).
 *
 * Seats are numbered clockwise: 0 = You (South), 1 = West, 2 = North (your
 * teammate), 3 = East. Team 0 is seats 0 and 2, team 1 is seats 1 and 3.
 *
 * Works as a classic <script> (attaches to `window.EuchreRules`) and as a
 * CommonJS module (`require('./rules.js')`).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EuchreRules = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SUITS = Object.freeze(['hearts', 'diamonds', 'clubs', 'spades']);
    const VALUES = Object.freeze(['9', '10', 'J', 'Q', 'K', 'A']);

    const SAME_COLOR_SUIT = Object.freeze({
        hearts: 'diamonds',
        diamonds: 'hearts',
        clubs: 'spades',
        spades: 'clubs'
    });

    const TRUMP_RANK = Object.freeze({ A: 98, K: 97, Q: 96, '10': 95, '9': 94 });
    const PLAIN_RANK = Object.freeze({ A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9 });

    // ─── Deck ────────────────────────────────────────────────────────────

    /** Build the 24-card Euchre deck (9 through Ace in each suit), unshuffled. */
    function createOrderedDeck() {
        const deck = [];
        for (const suit of SUITS) {
            for (const value of VALUES) deck.push({ suit, value });
        }
        return deck;
    }

    /** Fisher-Yates shuffle in place. `random` is injectable for deterministic tests. */
    function shuffleDeck(deck, random = Math.random) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function createDeck(random = Math.random) {
        return shuffleDeck(createOrderedDeck(), random);
    }

    // ─── Suits and bowers ────────────────────────────────────────────────

    /** The other suit of the same color ("next"). */
    function getNextSuit(suit) {
        return SAME_COLOR_SUIT[suit];
    }

    /** The two suits of the opposite color ("cross" / "green"). */
    function getCrossSuits(suit) {
        return suit === 'hearts' || suit === 'diamonds' ? ['clubs', 'spades'] : ['hearts', 'diamonds'];
    }

    /** For a Jack, the suit it would be the left bower of; null for anything else. */
    function getSuitOfLeftBower(card) {
        if (!card || card.value !== 'J') return null;
        return SAME_COLOR_SUIT[card.suit] || null;
    }

    function isRightBower(card, trumpSuit) {
        return !!card && !!trumpSuit && card.value === 'J' && card.suit === trumpSuit;
    }

    function isLeftBower(card, trumpSuit) {
        return !!card && !!trumpSuit && card.value === 'J' && getSuitOfLeftBower(card) === trumpSuit;
    }

    function isBower(card, trumpSuit) {
        return isRightBower(card, trumpSuit) || isLeftBower(card, trumpSuit);
    }

    /** The suit a card plays as: the left bower belongs to trump, everything else to its printed suit. */
    function getEffectiveSuit(card, trumpSuit) {
        if (!card) return null;
        if (!trumpSuit) return card.suit;
        return isLeftBower(card, trumpSuit) ? trumpSuit : card.suit;
    }

    function isCardTrump(card, trumpSuit) {
        if (!card || !trumpSuit) return false;
        return getEffectiveSuit(card, trumpSuit) === trumpSuit;
    }

    /**
     * Rank of a card, higher is better. Trump always outranks non-trump:
     * right bower 100, left bower 99, then A-9 of trump 98-94; plain cards 14-9.
     */
    function getEuchreCardValue(card, trumpSuit) {
        if (!card) return 0;
        if (isRightBower(card, trumpSuit)) return 100;
        if (isLeftBower(card, trumpSuit)) return 99;
        if (card.suit === trumpSuit) return TRUMP_RANK[card.value] || 0;
        return PLAIN_RANK[card.value] || 0;
    }

    // ─── Trick play ──────────────────────────────────────────────────────

    /** Does card1 beat card2, given trump and the suit that was led? */
    function isCardHigher(card1, card2, trumpSuit, leadSuit) {
        const t1 = isCardTrump(card1, trumpSuit);
        const t2 = isCardTrump(card2, trumpSuit);
        if (t1 !== t2) return t1;

        if (!t1) {
            const l1 = getEffectiveSuit(card1, trumpSuit) === leadSuit;
            const l2 = getEffectiveSuit(card2, trumpSuit) === leadSuit;
            if (l1 !== l2) return l1;
            // Neither trump nor lead suit: neither can win, so card1 never "beats" card2.
            if (!l1) return false;
        }
        return getEuchreCardValue(card1, trumpSuit) > getEuchreCardValue(card2, trumpSuit);
    }

    /** Must-follow-suit check. With no lead yet, anything goes. */
    function canPlayCard(card, hand, leadSuit, trumpSuit) {
        if (!leadSuit) return true;
        const hasLeadSuit = hand.some(c => getEffectiveSuit(c, trumpSuit) === leadSuit);
        return !hasLeadSuit || getEffectiveSuit(card, trumpSuit) === leadSuit;
    }

    /** Every card in `hand` that may legally be played right now. */
    function getLegalCards(hand, leadSuit, trumpSuit) {
        return hand.filter(c => canPlayCard(c, hand, leadSuit, trumpSuit));
    }

    /**
     * Given a trick as [{ card, player }, ...] in play order, return the entry
     * that wins it. The lead suit is taken from the first card.
     */
    function getTrickWinner(trick, trumpSuit) {
        if (!trick || trick.length === 0) return null;
        const leadSuit = getEffectiveSuit(trick[0].card, trumpSuit);
        return trick.reduce((best, play) =>
            isCardHigher(play.card, best.card, trumpSuit, leadSuit) ? play : best
        );
    }

    // ─── Seats and teams ─────────────────────────────────────────────────

    function getPartnerIndex(seat) {
        return seat >= 0 && seat <= 3 ? (seat + 2) % 4 : -1;
    }

    function teamOf(seat) {
        return seat % 2 === 0 ? 0 : 1;
    }

    /** Next seat clockwise, skipping a partner who is sitting out for a loner. */
    function nextSeat(seat, sittingOut = null) {
        const next = (seat + 1) % 4;
        return next === sittingOut ? (next + 1) % 4 : next;
    }

    // ─── Scoring ─────────────────────────────────────────────────────────

    /**
     * Score a finished hand.
     *   3-4 tricks by makers: 1 point
     *   5 tricks by makers: 2 points, or 4 if the maker went alone
     *   0-2 tricks by makers: defenders euchre them for 2 points
     * Returns { scoringTeam, points, outcome } where outcome is
     * 'made' | 'march' | 'loner_march' | 'euchre'.
     */
    function scoreHand({ makerTeam, makerTricks, alone = false }) {
        if (makerTeam !== 0 && makerTeam !== 1) throw new RangeError('makerTeam must be 0 or 1');
        if (!(makerTricks >= 0 && makerTricks <= 5)) throw new RangeError('makerTricks must be 0-5');

        if (makerTricks < 3) return { scoringTeam: 1 - makerTeam, points: 2, outcome: 'euchre' };
        if (makerTricks === 5) {
            return alone
                ? { scoringTeam: makerTeam, points: 4, outcome: 'loner_march' }
                : { scoringTeam: makerTeam, points: 2, outcome: 'march' };
        }
        return { scoringTeam: makerTeam, points: 1, outcome: 'made' };
    }

    /** Index of the winning team, or null while nobody has reached the target. */
    function getGameWinner(score, winningScore) {
        if (score[0] >= winningScore) return 0;
        if (score[1] >= winningScore) return 1;
        return null;
    }

    // ─── Hand evaluation (used by AI bidding) ────────────────────────────

    /**
     * Heuristic strength of `hand` if `trumpSuit` were trump. Higher is better;
     * the AI compares it against per-difficulty thresholds.
     */
    function evaluateHandStrength(hand, trumpSuit) {
        let score = 0;
        let trumpCount = 0;
        let hasRight = false;
        let hasLeft = false;
        const suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
        const trumpPoints = { A: 3.5, K: 2.5, Q: 2, '10': 1.5, '9': 0.5 };

        for (const card of hand) {
            const suit = getEffectiveSuit(card, trumpSuit);
            suitCounts[suit]++;

            if (suit === trumpSuit) {
                trumpCount++;
                if (isRightBower(card, trumpSuit)) { score += 5; hasRight = true; }
                else if (isLeftBower(card, trumpSuit)) { score += 4.5; hasLeft = true; }
                else score += trumpPoints[card.value] || 0;
            } else if (card.value === 'A') {
                score += 2;
            } else if (card.value === 'K') {
                score += 0.5;
            }
        }

        if (trumpCount > 0) {
            for (const suit of SUITS) {
                if (suit === trumpSuit) continue;
                if (suitCounts[suit] === 0) score += 2;
                else if (suitCounts[suit] === 1) score += 1;
            }
        }
        if (trumpCount >= 3) score += 1.5;
        if (trumpCount >= 4) score += 2;
        if (hasRight && hasLeft) score += 2;
        return score;
    }

    // ─── Display helpers ─────────────────────────────────────────────────

    const VALUE_NAMES = Object.freeze({ J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' });

    function getCardName(card) {
        if (!card) return 'Unknown Card';
        return `${VALUE_NAMES[card.value] || card.value} of ${card.suit}`;
    }

    return Object.freeze({
        SUITS,
        VALUES,
        createOrderedDeck,
        shuffleDeck,
        createDeck,
        getNextSuit,
        getCrossSuits,
        getSuitOfLeftBower,
        isRightBower,
        isLeftBower,
        isBower,
        getEffectiveSuit,
        isCardTrump,
        getEuchreCardValue,
        isCardHigher,
        canPlayCard,
        getLegalCards,
        getTrickWinner,
        getPartnerIndex,
        teamOf,
        nextSeat,
        scoreHand,
        getGameWinner,
        evaluateHandStrength,
        getCardName
    });
});
