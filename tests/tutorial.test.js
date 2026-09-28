const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tutorial-lessons.js');

const OTHER_SEATS = ['west', 'north', 'east'];
const INTERACTIONS = ['ask', 'trick'];

// Every card visible at once on the table during a step (face-up hands, up card, preset trick, trick plays)
function visibleCards(table, step) {
    const cards = [...table.hands.south];
    for (const seat of OTHER_SEATS) if (Array.isArray(table.hands[seat])) cards.push(...table.hands[seat]);
    if (table.upcard) cards.push(table.upcard);
    cards.push(...table.trick.map(p => p.card));
    if (step.trick) cards.push(...Object.values(step.trick.plays));
    return cards;
}

// Walk a level the way the UI does, checking each step. Returns nothing; asserts as it goes.
function replayLevel(level) {
    let table = T.createTable();
    level.steps.forEach((step, i) => {
        const where = `${level.id} step ${i + 1}`;
        table = T.applyPatch(table, step.table);

        assert.equal(typeof step.say, 'string', `${where}: needs coach text`);
        assert.ok(step.say.length > 0 && step.say.length < 400, `${where}: coach text should be short enough to read on a phone`);
        assert.ok(INTERACTIONS.filter(k => step[k]).length <= 1, `${where}: at most one interaction`);

        const cards = visibleCards(table, step);
        cards.forEach(T.parseCard);
        assert.equal(new Set(cards).size, cards.length, `${where}: a card appears twice (${cards})`);
        assert.ok(table.hands.south.length <= 6, `${where}: at most six cards in hand`);
        (table.showcase?.cards || []).forEach(T.parseCard);
        (step.highlight || []).forEach(T.parseCard);
        for (const seat of step.seats || []) assert.ok(T.SEATS.includes(seat), `${where}: unknown seat ${seat}`);
        if (table.trump) assert.ok(['hearts', 'diamonds', 'clubs', 'spades'].includes(table.trump), `${where}: bad trump`);

        if (step.ask?.type === 'card') {
            const hand = table.hands.south;
            assert.ok(step.ask.accept.length > 0, `${where}: needs a right answer`);
            for (const code of step.ask.accept) assert.ok(hand.includes(code), `${where}: answer ${code} is not in your hand`);
            for (const code of Object.keys(step.ask.feedback || {})) assert.ok(hand.includes(code), `${where}: feedback for ${code}, which is not in your hand`);
            if (step.ask.remove) table = T.removeFromHand(table, step.ask.accept[0]);
        }

        if (step.ask?.type === 'choice') {
            const right = step.ask.options.filter(o => o.correct);
            assert.equal(right.length, 1, `${where}: exactly one right answer`);
            for (const o of step.ask.options) {
                if (!o.correct) assert.ok(o.feedback, `${where}: wrong answer "${o.label}" needs feedback`);
            }
            if (step.ask.winner) {
                assert.equal(T.trickWinner(table.trick, table.trump), step.ask.winner, `${where}: quiz trick winner`);
            }
        }

        if (step.trick) {
            const { leader, plays, accept, feedback = {}, winner } = step.trick;
            const order = T.playOrder(leader, table.sittingOut);
            assert.ok(order.includes('south'), `${where}: you must be in the trick`);
            assert.deepEqual(
                Object.keys(plays).sort(),
                order.filter(s => s !== 'south').sort(),
                `${where}: plays must cover exactly the other seats in the trick`
            );
            assert.ok(winner, `${where}: needs a winner`);

            const hand = table.hands.south;
            const southAt = order.indexOf('south');
            const leadCode = southAt === 0 ? null : plays[order[0]];
            const legal = T.legalCards(hand, leadCode, table.trump);
            const accepted = accept === 'any' ? legal : accept;
            assert.ok(accepted.length > 0, `${where}: no acceptable card`);
            for (const code of Object.keys(feedback)) {
                assert.ok(hand.includes(code), `${where}: feedback for ${code}, which is not in your hand`);
                assert.ok(!accepted.includes(code), `${where}: feedback for an accepted card ${code}`);
                assert.ok(legal.includes(code), `${where}: feedback for illegal ${code} is never shown (illegal cards get the follow-suit message)`);
            }

            let last;
            for (const code of accepted) {
                assert.ok(legal.includes(code), `${where}: accepted card ${code} is not a legal play`);
                const trick = order.map(seat => ({ seat, card: seat === 'south' ? code : plays[seat] }));
                // The other players follow suit too when they can see their own (face-up) hands
                const lead = trick[0].card;
                for (const p of trick.slice(1)) {
                    const h = table.hands[p.seat];
                    if (Array.isArray(h)) assert.ok(T.checkLegal(p.card, h, lead, table.trump).ok, `${where}: ${p.seat} reneged`);
                }
                assert.equal(T.trickWinner(trick, table.trump), winner, `${where}: playing ${code} should leave ${winner} winning`);
                last = trick;
            }
            table = T.afterTrick(table, last);
        }
    });
}

describe('card codes', () => {
    test('parse and print round-trip', () => {
        assert.deepEqual(T.parseCard('JH'), { value: 'J', suit: 'hearts' });
        assert.deepEqual(T.parseCard('10S'), { value: '10', suit: 'spades' });
        assert.equal(T.cardCode({ value: 'A', suit: 'diamonds' }), 'AD');
    });

    test('reject cards that are not in a Euchre deck', () => {
        for (const bad of ['8H', 'JX', '', 'Joker', '1H']) assert.throws(() => T.parseCard(bad));
    });
});

describe('table helpers', () => {
    test('play order goes clockwise from the leader', () => {
        assert.deepEqual(T.playOrder('west'), ['west', 'north', 'east', 'south']);
        assert.deepEqual(T.playOrder('south'), ['south', 'west', 'north', 'east']);
    });

    test('play order skips a partner sitting out', () => {
        assert.deepEqual(T.playOrder('east', 'west'), ['east', 'south', 'north']);
        assert.deepEqual(T.playOrder('south', 'north'), ['south', 'west', 'east']);
    });

    test('patches carry forward, but trick and showcase are per step', () => {
        let t = T.applyPatch(T.createTable(), { trump: 'hearts', hands: { south: ['JH'], west: 5 }, showcase: { cards: ['AS'] } });
        t = T.applyPatch(t, { dealer: 'east' });
        assert.equal(t.trump, 'hearts');
        assert.deepEqual(t.hands.south, ['JH']);
        assert.equal(t.hands.west, 5);
        assert.equal(t.showcase, null);
        assert.deepEqual(t.trick, []);
    });

    test('a finished trick leaves every hand', () => {
        const t = T.applyPatch(T.createTable(), { hands: { south: ['AS', 'KH'], west: 5, north: ['9S', 'QD'], east: 5 } });
        const plays = [{ seat: 'south', card: 'AS' }, { seat: 'west', card: 'KS' }, { seat: 'north', card: '9S' }, { seat: 'east', card: 'QS' }];
        const after = T.afterTrick(t, plays);
        assert.deepEqual(after.hands.south, ['KH']);
        assert.deepEqual(after.hands.north, ['QD']);
        assert.equal(after.hands.west, 4);
        assert.deepEqual(t.hands.south, ['AS', 'KH'], 'the original table is untouched');
    });

    test('the left bower does not have to follow its printed suit', () => {
        // Hearts trump, diamonds led: the J♦ is a heart, so a hand with no other diamonds may play anything
        assert.ok(T.checkLegal('10H', ['JD', '10H'], 'AD', 'hearts').ok);
        const r = T.checkLegal('QS', ['JD', 'QS', '10D'], 'AD', 'hearts');
        assert.equal(r.ok, false);
        assert.match(r.reason, /diamond/);
    });

    test('leading the left bower calls for trump', () => {
        const r = T.checkLegal('9D', ['9D', 'QH'], 'JD', 'hearts');
        assert.equal(r.ok, false);
        assert.match(r.reason, /heart.*trump.*Left Bower/);
    });
});

describe('lessons', () => {
    test('levels have unique ids and the fields the UI needs', () => {
        const ids = T.LEVELS.map(l => l.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const level of T.LEVELS) {
            assert.ok(level.title && level.blurb && level.outro, `${level.id}: title, blurb and outro`);
            assert.ok(level.steps.length >= 5, `${level.id}: a real lesson`);
            assert.ok(level.steps.some(s => s.ask || s.trick), `${level.id}: has something to do, not just read`);
        }
    });

    for (const level of T.LEVELS) {
        test(`"${level.title}" is consistent with the rules`, () => replayLevel(level));
    }
});
