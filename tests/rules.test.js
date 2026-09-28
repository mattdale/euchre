const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules.js');

// Shorthand: c('J', 'hearts') -> { value: 'J', suit: 'hearts' }
const c = (value, suit) => ({ value, suit });

describe('deck', () => {
    test('has 24 unique cards, 9 through Ace in four suits', () => {
        const deck = R.createOrderedDeck();
        assert.equal(deck.length, 24);
        assert.equal(new Set(deck.map(x => x.value + x.suit)).size, 24);
    });

    test('shuffle keeps every card and uses the injected RNG', () => {
        let seed = 42;
        const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        const a = R.createDeck(rng);
        seed = 42;
        const b = R.createDeck(rng);
        assert.deepEqual(a, b, 'same seed gives the same order');
        assert.equal(new Set(a.map(x => x.value + x.suit)).size, 24);
    });
});

describe('bowers and effective suit', () => {
    test('left bower is the same-color Jack and plays as trump', () => {
        assert.equal(R.getEffectiveSuit(c('J', 'diamonds'), 'hearts'), 'hearts');
        assert.equal(R.getEffectiveSuit(c('J', 'spades'), 'clubs'), 'clubs');
        assert.ok(R.isLeftBower(c('J', 'diamonds'), 'hearts'));
        assert.ok(R.isCardTrump(c('J', 'diamonds'), 'hearts'));
    });

    test('opposite-color Jacks keep their own suit', () => {
        assert.equal(R.getEffectiveSuit(c('J', 'clubs'), 'hearts'), 'clubs');
        assert.ok(!R.isCardTrump(c('J', 'clubs'), 'hearts'));
    });

    test('with no trump yet, every card is its printed suit', () => {
        assert.equal(R.getEffectiveSuit(c('J', 'diamonds'), null), 'diamonds');
        assert.ok(!R.isCardTrump(c('A', 'hearts'), null));
    });

    test('trump ranking: right > left > A > K > Q > 10 > 9 > any plain card', () => {
        const trump = 'spades';
        const order = [c('J', 'spades'), c('J', 'clubs'), c('A', 'spades'), c('K', 'spades'),
            c('Q', 'spades'), c('10', 'spades'), c('9', 'spades'), c('A', 'hearts')];
        const values = order.map(x => R.getEuchreCardValue(x, trump));
        assert.deepEqual([...values].sort((a, b) => b - a), values);
        assert.equal(new Set(values).size, values.length);
    });

    test('next and cross suits', () => {
        assert.equal(R.getNextSuit('hearts'), 'diamonds');
        assert.equal(R.getNextSuit('clubs'), 'spades');
        assert.deepEqual(R.getCrossSuits('hearts'), ['clubs', 'spades']);
        assert.deepEqual(R.getCrossSuits('spades'), ['hearts', 'diamonds']);
    });
});

describe('follow suit', () => {
    const trump = 'hearts';

    test('anything goes when leading', () => {
        const hand = [c('9', 'clubs'), c('A', 'spades')];
        assert.deepEqual(R.getLegalCards(hand, null, trump), hand);
    });

    test('must follow the led suit when able', () => {
        const hand = [c('9', 'clubs'), c('A', 'spades'), c('K', 'clubs')];
        assert.deepEqual(R.getLegalCards(hand, 'clubs', trump), [c('9', 'clubs'), c('K', 'clubs')]);
        assert.ok(!R.canPlayCard(c('A', 'spades'), hand, 'clubs', trump));
    });

    test('left bower counts as trump, not its printed suit', () => {
        // Diamonds led, hearts trump: the J of diamonds is a heart, so it cannot follow diamonds.
        const hand = [c('J', 'diamonds'), c('9', 'diamonds'), c('A', 'clubs')];
        assert.deepEqual(R.getLegalCards(hand, 'diamonds', trump), [c('9', 'diamonds')]);
    });

    test('left bower must be played when trump is led and it is your only trump', () => {
        const hand = [c('J', 'diamonds'), c('A', 'clubs')];
        assert.deepEqual(R.getLegalCards(hand, 'hearts', trump), [c('J', 'diamonds')]);
    });

    test('void in the led suit may play anything', () => {
        const hand = [c('9', 'hearts'), c('A', 'spades')];
        assert.deepEqual(R.getLegalCards(hand, 'clubs', trump), hand);
    });
});

describe('trick winner', () => {
    const play = (player, value, suit) => ({ player, card: c(value, suit) });

    test('highest card of the led suit wins without trump', () => {
        const trick = [play(0, '9', 'clubs'), play(1, 'A', 'clubs'), play(2, 'A', 'spades'), play(3, 'K', 'clubs')];
        assert.equal(R.getTrickWinner(trick, 'hearts').player, 1);
    });

    test('any trump beats the led suit', () => {
        const trick = [play(0, 'A', 'clubs'), play(1, '9', 'hearts'), play(2, 'K', 'clubs'), play(3, 'Q', 'clubs')];
        assert.equal(R.getTrickWinner(trick, 'hearts').player, 1);
    });

    test('left bower beats the ace of trump; right bower beats both', () => {
        const trick = [play(0, 'A', 'hearts'), play(1, 'J', 'diamonds'), play(2, 'K', 'hearts'), play(3, 'J', 'hearts')];
        assert.equal(R.getTrickWinner(trick, 'hearts').player, 3);
        assert.equal(R.getTrickWinner(trick.slice(0, 3), 'hearts').player, 1);
    });

    test('a left bower lead makes trump the led suit', () => {
        // J of diamonds led with hearts trump: the A of diamonds is off-suit and cannot win.
        const trick = [play(2, 'J', 'diamonds'), play(3, 'A', 'diamonds'), play(0, '9', 'clubs')];
        assert.equal(R.getTrickWinner(trick, 'hearts').player, 2);
    });

    test('off-suit cards never win, even if higher', () => {
        const trick = [play(0, '9', 'clubs'), play(1, 'A', 'spades'), play(2, 'A', 'diamonds')];
        assert.equal(R.getTrickWinner(trick, 'hearts').player, 0);
    });

    test('three-card trick when someone goes alone', () => {
        const trick = [play(1, 'K', 'spades'), play(2, 'A', 'spades'), play(3, '9', 'spades')];
        assert.equal(R.getTrickWinner(trick, 'clubs').player, 2);
    });

    test('empty trick has no winner', () => {
        assert.equal(R.getTrickWinner([], 'clubs'), null);
    });
});

describe('seats', () => {
    test('partners sit across', () => {
        assert.deepEqual([0, 1, 2, 3].map(R.getPartnerIndex), [2, 3, 0, 1]);
        assert.equal(R.getPartnerIndex(7), -1);
    });

    test('teams', () => {
        assert.deepEqual([0, 1, 2, 3].map(R.teamOf), [0, 1, 0, 1]);
    });

    test('next seat is clockwise and skips a partner sitting out', () => {
        assert.equal(R.nextSeat(3), 0);
        assert.equal(R.nextSeat(0, 1), 2);
        assert.equal(R.nextSeat(3, 0), 1);
    });
});

describe('scoring', () => {
    test('makers taking 3 or 4 score 1', () => {
        assert.deepEqual(R.scoreHand({ makerTeam: 0, makerTricks: 3 }), { scoringTeam: 0, points: 1, outcome: 'made' });
        assert.deepEqual(R.scoreHand({ makerTeam: 1, makerTricks: 4, alone: true }), { scoringTeam: 1, points: 1, outcome: 'made' });
    });

    test('a march scores 2, or 4 alone', () => {
        assert.deepEqual(R.scoreHand({ makerTeam: 0, makerTricks: 5 }), { scoringTeam: 0, points: 2, outcome: 'march' });
        assert.deepEqual(R.scoreHand({ makerTeam: 1, makerTricks: 5, alone: true }), { scoringTeam: 1, points: 4, outcome: 'loner_march' });
    });

    test('makers taking fewer than 3 are euchred for 2 to the defenders', () => {
        for (const tricks of [0, 1, 2]) {
            assert.deepEqual(R.scoreHand({ makerTeam: 0, makerTricks: tricks }), { scoringTeam: 1, points: 2, outcome: 'euchre' });
        }
    });

    test('rejects impossible input', () => {
        assert.throws(() => R.scoreHand({ makerTeam: 2, makerTricks: 3 }), RangeError);
        assert.throws(() => R.scoreHand({ makerTeam: 0, makerTricks: 6 }), RangeError);
    });

    test('game winner', () => {
        assert.equal(R.getGameWinner([9, 8], 10), null);
        assert.equal(R.getGameWinner([10, 8], 10), 0);
        assert.equal(R.getGameWinner([7, 11], 10), 1);
    });
});

describe('hand strength', () => {
    test('both bowers plus the ace beats a hand of off-suit junk', () => {
        const strong = [c('J', 'hearts'), c('J', 'diamonds'), c('A', 'hearts'), c('9', 'clubs'), c('A', 'spades')];
        const weak = [c('9', 'clubs'), c('10', 'clubs'), c('Q', 'spades'), c('9', 'diamonds'), c('10', 'spades')];
        assert.ok(R.evaluateHandStrength(strong, 'hearts') > 14);
        assert.ok(R.evaluateHandStrength(weak, 'hearts') < 4);
    });

    test('left bower counts toward trump, not its printed suit', () => {
        const hand = [c('J', 'diamonds'), c('9', 'clubs'), c('10', 'spades')];
        // Hearts trump: the J of diamonds is the left bower, so the hand holds trump.
        // Clubs trump: it holds only the 9 of clubs.
        assert.ok(R.evaluateHandStrength(hand, 'hearts') > R.evaluateHandStrength(hand, 'clubs'));
    });
});

test('card names', () => {
    assert.equal(R.getCardName(c('J', 'hearts')), 'Jack of hearts');
    assert.equal(R.getCardName(c('10', 'clubs')), '10 of clubs');
});
