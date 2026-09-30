/**
 * "How to Play" lessons, plus the pure helpers the tutorial runs on.
 *
 * Content is plain data so it can be checked in Node (tests/tutorial.test.js
 * replays every lesson against rules.js: every scripted play is legal, every
 * "right answer" really is right, and every trick is won by who the coach
 * says won it). The browser UI lives in tutorial.js.
 *
 * Cards are short codes: value + suit letter, e.g. 'JH' (Jack of hearts),
 * '10S', 'AD', '9C'. In coach text, {JH} renders as a little card chip and
 * {H} as a bare suit symbol. **bold** is bold, and lines starting "- " are a list.
 *
 * A level is { id, title, blurb, outro, steps }. A step is:
 *   say        What the coach says. Always required.
 *   table      Changes to the table, carried forward to later steps:
 *                trump, dealer, upcard, upcardDown, sittingOut, and
 *                hands: { south: [codes], north|west|east: count or [codes] }.
 *              Per-step only (cleared unless given): trick [{ seat, card }], showcase { cards, labels }.
 *   highlight  Card codes to glow. seats: seat names to glow.
 * and at most one interaction (no interaction = a Next button):
 *   ask: { type: 'card', accept, feedback, fallback, success, remove }
 *        Tap a card in your hand. `remove` takes it out of your hand (a discard).
 *   ask: { type: 'choice', options: [{ label, correct, feedback }], success, winner }
 *        `winner` (optional) is the seat that wins the preset trick being asked about.
 *   trick: { leader, plays, accept, feedback, fallback, prompt, winner, after }
 *        Everyone plays in turn; `plays` holds the other seats' cards and you pick
 *        yours. `accept` is a list or 'any' (any legal card). `winner` must hold for
 *        every accepted card.
 *
 * Works as a classic <script> (window.EuchreTutorial) and as a CommonJS module.
 */
(function (root, factory) {
    const api = factory(root.EuchreRules || (typeof require === 'function' ? require('./rules.js') : null));
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EuchreTutorial = api;
    }
})(typeof self !== 'undefined' ? self : this, function (Rules) {
    'use strict';

    // Seat order matches rules.js: index 0 = You (South), then clockwise.
    const SEATS = Object.freeze(['south', 'west', 'north', 'east']);
    const SUIT_BY_LETTER = Object.freeze({ H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' });
    const LETTER_BY_SUIT = Object.freeze({ hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' });
    const SUIT_SINGULAR = Object.freeze({ hearts: 'heart', diamonds: 'diamond', clubs: 'club', spades: 'spade' });

    // ─── Cards ───────────────────────────────────────────────────────────

    /** 'JH' -> { value: 'J', suit: 'hearts' }. Throws on anything that isn't a Euchre card. */
    function parseCard(code) {
        const m = /^(9|10|J|Q|K|A)([HDCS])$/.exec(String(code));
        if (!m) throw new Error(`Not a Euchre card: ${code}`);
        return { value: m[1], suit: SUIT_BY_LETTER[m[2]] };
    }

    function cardCode(card) {
        return card.value + LETTER_BY_SUIT[card.suit];
    }

    // ─── Table ───────────────────────────────────────────────────────────

    function createTable() {
        return {
            trump: null,
            dealer: null,
            upcard: null,
            upcardDown: false,
            sittingOut: null,
            hands: { south: [], west: 0, north: 0, east: 0 },
            trick: [],
            showcase: null
        };
    }

    const cloneHand = h => (Array.isArray(h) ? [...h] : h);

    /**
     * The table for a step: `table` carried forward with `patch` applied.
     * Trick and showcase are per-step visuals, so they reset unless the patch sets them.
     */
    function applyPatch(table, patch = {}) {
        const hands = {};
        for (const seat of SEATS) hands[seat] = cloneHand((patch.hands && seat in patch.hands) ? patch.hands[seat] : table.hands[seat]);
        const next = { ...table, ...patch, hands };
        next.trick = patch.trick ? patch.trick.map(p => ({ ...p })) : [];
        next.showcase = patch.showcase || null;
        return next;
    }

    /** Seats in play order for a trick, starting with `leader` and skipping a partner who sits out. */
    function playOrder(leader, sittingOut = null) {
        const start = SEATS.indexOf(leader);
        if (start < 0) throw new Error(`Unknown seat: ${leader}`);
        const order = [];
        for (let i = 0; i < 4; i++) {
            const seat = SEATS[(start + i) % 4];
            if (seat !== sittingOut) order.push(seat);
        }
        return order;
    }

    /** The suit a card counts as this hand (the left bower counts as trump). */
    function effectiveSuit(code, trump) {
        return Rules.getEffectiveSuit(parseCard(code), trump);
    }

    /**
     * Can `code` be played from `hand` when `leadCode` was led?
     * Returns { ok: true } or { ok: false, reason } with a coach-friendly reason.
     */
    function checkLegal(code, hand, leadCode, trump) {
        if (!leadCode) return { ok: true };
        const cards = hand.map(parseCard);
        const leadSuit = effectiveSuit(leadCode, trump);
        if (Rules.canPlayCard(parseCard(code), cards, leadSuit, trump)) return { ok: true };
        const bowerNote = Rules.isLeftBower(parseCard(leadCode), trump) ? ' (the Left Bower counts as trump)' : '';
        const trumpNote = leadSuit === trump ? ', which is trump' : '';
        return {
            ok: false,
            reason: `A ${SUIT_SINGULAR[leadSuit]} was led${trumpNote}${bowerNote}, and you have one, so you have to follow suit.`
        };
    }

    /** Legal cards in `hand` for the current trick. */
    function legalCards(hand, leadCode, trump) {
        return hand.filter(code => checkLegal(code, hand, leadCode, trump).ok);
    }

    /** Seat that wins a trick given as [{ seat, card }] in play order. */
    function trickWinner(plays, trump) {
        const winner = Rules.getTrickWinner(plays.map(p => ({ player: p.seat, card: parseCard(p.card) })), trump);
        return winner ? winner.player : null;
    }

    /** Table after a trick: every played card leaves its player's hand. */
    function afterTrick(table, plays) {
        const hands = { ...table.hands };
        for (const { seat, card } of plays) {
            const h = hands[seat];
            if (Array.isArray(h)) hands[seat] = h.filter(c => c !== card);
            else if (typeof h === 'number') hands[seat] = Math.max(0, h - 1);
        }
        return { ...table, hands };
    }

    /** Your hand without `code` (for discards). */
    function removeFromHand(table, code) {
        return { ...table, hands: { ...table.hands, south: table.hands.south.filter(c => c !== code) } };
    }

    // ─── Lessons ─────────────────────────────────────────────────────────

    const FULL_TABLE = { south: [], west: 5, north: 5, east: 5 };
    const EMPTY_TABLE = { south: [], west: 0, north: 0, east: 0 };
    const CLEAR = { trump: null, dealer: null, upcard: null, upcardDown: false, sittingOut: null };

    const LEVELS = [
        {
            id: 'basics',
            title: 'The Basics',
            blurb: 'Teams, the tiny deck, and how a trick works.',
            outro: 'Level 1 done! You know teams, tricks and following suit. Next up is the fun part: trump.',
            steps: [
                {
                    table: { ...CLEAR, hands: EMPTY_TABLE },
                    say: "Hey, I'm Jack. Yes, like the card. In Euchre, Jacks are kind of a big deal. Give me a few minutes and you'll play like you grew up with it."
                },
                {
                    seats: ['south', 'north'],
                    say: 'Euchre is four players in two teams. You sit at the bottom, and your **partner** sits across from you at the top. You win together and you lose together.'
                },
                {
                    seats: ['west', 'east'],
                    say: "The two players on the sides are your **opponents**. (The main game has ruder names for them. I'm keeping it classy.)"
                },
                {
                    table: { showcase: { cards: ['AS', 'KS', 'QS', 'JS', '10S', '9S'], labels: ['High', '', '', '', '', 'Low'] } },
                    say: "Euchre uses a tiny deck: just the 9, 10, Jack, Queen, King and Ace of each suit. That's 24 cards. Normally they rank the way you'd expect, Ace high down to 9 low."
                },
                {
                    table: { hands: { south: ['KH', 'AS', '10D', 'QC', '9S'], west: 5, north: 5, east: 5 } },
                    say: 'Everyone gets **five cards**. These are yours. A hand is played in five rounds called **tricks**.'
                },
                {
                    say: "In a trick, everyone plays one card, going clockwise. The first card is the **lead**, and everyone else must **follow suit**: play that suit if you have it. Highest card of the led suit wins.\n\nFor now, let's pretend there's no trump. (It's coming. It's the best part.)"
                },
                {
                    say: "West leads this trick, then North, then East. You're last. Watch the cards come in.",
                    trick: {
                        leader: 'west',
                        plays: { west: '10H', north: '9H', east: 'QH' },
                        prompt: 'Hearts were led. Your turn: play a card.',
                        accept: ['KH'],
                        winner: 'south',
                        after: 'Your {KH} is the highest heart, so **you win the trick**. That\'s all a trick is!'
                    }
                },
                {
                    say: 'Whoever wins a trick leads the next one. That\'s you! You can lead any card you like, so pick a strong one.',
                    trick: {
                        leader: 'south',
                        plays: { west: 'QS', north: '10S', east: 'KS' },
                        accept: ['AS'],
                        feedback: {
                            '9S': 'The 9 is the lowest card there is, so it rarely wins. Try your strongest card.',
                            '10D': 'You could, but you have an Ace. Nobody can beat an Ace in its own suit here.',
                            QC: 'You could, but you have an Ace. Nobody can beat an Ace in its own suit here.'
                        },
                        winner: 'south',
                        after: 'Nobody could top the {AS}. **Two tricks** for your team!'
                    }
                },
                {
                    say: "What if you can't follow suit? Then you can play **any card**, but a card that doesn't follow suit can't win. East leads this one.",
                    trick: {
                        leader: 'east',
                        plays: { east: 'AH', west: 'KD', north: '9C' },
                        prompt: "Hearts were led and you're out of hearts. Play anything.",
                        accept: 'any',
                        winner: 'east',
                        after: 'East wins with the {AH}. Pro tip: when you can\'t win a trick, throw away your weakest card and keep the good stuff.'
                    }
                },
                {
                    table: { hands: EMPTY_TABLE, trick: [{ seat: 'west', card: 'QD' }, { seat: 'north', card: 'AC' }, { seat: 'east', card: 'KD' }, { seat: 'south', card: '9D' }] },
                    say: 'Quick quiz! West led a diamond. Which card wins this trick?',
                    ask: {
                        type: 'choice',
                        winner: 'east',
                        options: [
                            { label: "West's {QD}", feedback: 'Close, but a King beats a Queen.' },
                            { label: "North's {AC}", feedback: "Big card, wrong suit. Diamonds were led, and a card that doesn't follow suit can't win." },
                            { label: "East's {KD}", correct: true },
                            { label: 'Your {9D}', feedback: 'Bless you. The 9 is the lowest card in the deck.' }
                        ],
                        success: "Yep! The {KD} is the highest diamond. The {AC} looked scary, but it didn't follow suit, so it can't win."
                    }
                },
                {
                    say: 'Win **at least 3 of the 5 tricks** and your team scores. First team to **10 points** wins the game.\n\nThat\'s the skeleton of Euchre. Now let\'s add some spice.'
                }
            ]
        },
        {
            id: 'trump',
            title: 'Trump & the Bowers',
            blurb: 'Why a 9 can beat an Ace, and the two Jacks that run the show.',
            outro: 'Level 2 done! Trump beats everything, the Right Bower beats all, and the Left Bower switches teams. That\'s the rule that trips up everyone at their first game.',
            steps: [
                {
                    table: { ...CLEAR, trump: 'hearts', hands: EMPTY_TABLE, showcase: { cards: ['9H', 'AS'], labels: ['9 of trump', 'Ace of spades'] } },
                    highlight: ['9H'],
                    say: 'Every hand, one suit is named **trump**. Any trump card beats any card of another suit. With hearts as trump, this little {9H} beats the {AS}. Rude, but true.'
                },
                {
                    table: { hands: { south: ['9H', 'KD', 'QC', '10C', 'AD'], west: 5, north: 5, east: 5 } },
                    say: "Hearts are trump. East leads, and you're next.",
                    trick: {
                        leader: 'east',
                        plays: { east: 'AS', west: 'KS', north: '10S' },
                        prompt: "East led the {AS}, and you're out of spades. That means you're free to play trump. Take it!",
                        accept: ['9H'],
                        fallback: 'That can\'t beat the {AS}. Only trump can, and you have one.',
                        winner: 'south',
                        after: 'Your {9H} beat an Ace! That\'s called **trumping in**. You can only do it when you can\'t follow suit.'
                    }
                },
                {
                    table: { hands: EMPTY_TABLE, showcase: { cards: ['JH'], labels: ['Right Bower'] } },
                    say: 'Now the twist. The **Jack of the trump suit** becomes the highest card in the game. It\'s called the **Right Bower**. (Told you Jacks were a big deal.)'
                },
                {
                    table: { showcase: { cards: ['JH', 'JD'], labels: ['Right Bower', 'Left Bower'] } },
                    highlight: ['JD'],
                    say: 'The **other Jack of the same color** is the second-highest card: the **Left Bower**. For this hand, the {JD} stops being a diamond and counts as a heart. Same color, new team.'
                },
                {
                    table: { showcase: { cards: ['JH', 'JD', 'AH', 'KH', 'QH', '10H', '9H'], labels: ['Right', 'Left', 'A', 'K', 'Q', '10', '9'] } },
                    say: 'So with hearts as trump there are **seven trumps**, ranked like this. The other suits rank as normal, Ace high. (Diamonds lent out their Jack, so they only have five cards this hand.)'
                },
                {
                    table: { trump: 'diamonds' },
                    say: 'Quiz time. **Diamonds** are trump. Which Jack is the Left Bower?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: '{JH}', correct: true },
                            { label: '{JD}', feedback: "That's the Right Bower: the Jack of the trump suit itself." },
                            { label: '{JS}', feedback: 'Wrong color. The Left Bower is the other Jack of the same color as trump.' },
                            { label: '{JC}', feedback: 'Wrong color. The Left Bower is the other Jack of the same color as trump.' }
                        ],
                        success: 'Exactly. Diamonds and hearts are both red, so the {JH} is the Left Bower.'
                    }
                },
                {
                    table: { trump: 'spades', hands: { south: ['AS', 'KS', 'JC', 'QD', 'AH'] } },
                    say: '**Spades** are trump. Tap the highest card in your hand.',
                    ask: {
                        type: 'card',
                        accept: ['JC'],
                        feedback: {
                            AS: 'So close! With spades as trump, the {JC} is the Left Bower, and it outranks every Ace.',
                            KS: 'The King is good, but there\'s a sneaky Jack in your hand that beats it.',
                            QD: "That's not trump. With spades as trump, the top cards are the Jacks of spades and clubs.",
                            AH: "That's not trump. With spades as trump, the top cards are the Jacks of spades and clubs."
                        },
                        success: 'The {JC} is the Left Bower. The only card in the game that beats it is the {JS}.'
                    }
                },
                {
                    table: { trump: 'hearts', hands: { south: ['JD', 'QS', 'KC', '10H', '9C'] } },
                    highlight: ['JD'],
                    say: 'One more trap. The Left Bower counts as trump, so it **doesn\'t count as its printed suit**. With hearts as trump, your {JD} is a heart. If diamonds are led, it doesn\'t follow diamonds.'
                },
                {
                    say: "Hearts are still trump. West leads, and you're last.",
                    trick: {
                        leader: 'west',
                        plays: { west: 'AD', north: '9D', east: 'KD' },
                        prompt: 'Diamonds were led. What\'s your best play?',
                        accept: ['10H'],
                        feedback: {
                            JD: "That wins, but it's overkill. Any trump wins this trick, so use your cheapest one and save the Left Bower for later.",
                            QS: "You're out of diamonds (your {JD} is a heart right now), so you can trump. Any heart wins this.",
                            KC: "You're out of diamonds (your {JD} is a heart right now), so you can trump. Any heart wins this.",
                            '9C': "You're out of diamonds (your {JD} is a heart right now), so you can trump. Any heart wins this."
                        },
                        winner: 'south',
                        after: 'Nailed it. Your {JD} is a heart, so you had no diamonds and could trump with the {10H}. Win with your cheapest winner.'
                    }
                },
                {
                    table: { hands: EMPTY_TABLE, trick: [{ seat: 'west', card: 'JD' }] },
                    say: 'Hearts are trump, and West leads the {JD}. What suit do you have to follow?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: '{D} Diamonds', feedback: 'Sneaky, right? The {JD} is the Left Bower, so it was led as a heart.' },
                            { label: '{H} Hearts', correct: true },
                            { label: 'Anything', feedback: 'Not quite. The {JD} counts as a heart, so you have to play a heart if you have one.' }
                        ],
                        success: 'Right. The Left Bower is trump in every way, including what counts as following suit.'
                    }
                }
            ]
        },
        {
            id: 'bidding',
            title: 'Calling Trump',
            blurb: 'How trump gets picked, when to go for it, and how points work.',
            outro: 'Level 3 done! You can bid, discard like a pro and keep score. Honestly, you could play a real game right now.',
            steps: [
                {
                    table: { ...CLEAR, dealer: 'east', upcard: '10H', hands: { south: ['JH', 'JD', 'AH', 'AC', '9S'], west: 5, north: 5, east: 5 } },
                    highlight: ['10H'],
                    seats: ['east'],
                    say: 'So who picks trump? After dealing, the **dealer** turns up the top card of the four leftovers. Its suit is the first choice for trump.'
                },
                {
                    say: "Starting at the dealer's left and going around, each player either **passes** or **orders it up**. Ordering up makes that suit trump, and the dealer picks up the card."
                },
                {
                    say: "East is dealing, so you go first. If you order it up, **hearts** are trump. What'll it be?",
                    ask: {
                        type: 'choice',
                        options: [
                            { label: 'Order it up', correct: true },
                            { label: 'Pass', feedback: "Passing on both bowers and the {AH}? Those are the three best cards in the game with hearts as trump. Order it up!" }
                        ],
                        success: 'Great call. You hold both bowers and the {AH}: the three best trumps there are. That hand takes three tricks almost by itself.'
                    }
                },
                {
                    table: { upcard: 'KS', hands: { south: ['9S', 'QD', '10C', 'KH', '9H'], west: 5, north: 5, east: 5 } },
                    highlight: ['KS'],
                    say: 'New deal, same seats. This time the up card is the {KS}. Order it up, or pass?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: 'Order it up', feedback: "Risky! That's one small trump and no Aces. If your team picks trump and doesn't take three tricks, you get euchred." },
                            { label: 'Pass', correct: true }
                        ],
                        success: 'Smart. With one little spade, you\'d be asking for trouble. Pass and let someone else take the risk.'
                    }
                },
                {
                    table: { upcard: null, hands: EMPTY_TABLE },
                    say: "Speaking of trouble: the team that picks trump are the **makers**, and they need at least 3 tricks.\n- 3 or 4 tricks: 1 point\n- All 5 tricks (a **march**): 2 points\n- Fewer than 3: they got **euchred**, and the other team scores 2"
                },
                {
                    table: { dealer: 'south', trump: 'diamonds', hands: { south: ['AD', 'JD', '10D', '9C', 'AH', 'KH'], west: 5, north: 5, east: 5 } },
                    highlight: ['AD'],
                    seats: ['south'],
                    say: 'Now **you\'re the dealer**, and your partner ordered up the {AD}. You picked it up, so you have six cards. Discard one, face down. Which goes?',
                    ask: {
                        type: 'card',
                        remove: true,
                        accept: ['9C'],
                        feedback: {
                            AD: "Never throw away trump if you can help it. Those are your trick winners.",
                            JD: "That's the Right Bower! Absolutely not. Never throw away trump if you can help it.",
                            '10D': "Never throw away trump if you can help it. Those are your trick winners.",
                            AH: "Keep that Ace! It'll probably win a trick.",
                            KH: 'Not bad, but there\'s a better one. Look for the card that would leave you with **none** of a suit.'
                        },
                        success: "Perfect. With your only club gone, you can trump the first club anyone leads. That's called **short-suiting** yourself, and it's a pro move."
                    }
                },
                {
                    table: { dealer: 'north', trump: null, upcard: 'QH', upcardDown: true, hands: { south: ['JS', 'JC', 'AS', 'KS', '10D'], west: 5, north: 5, east: 5 } },
                    seats: ['north'],
                    say: 'If all four players pass, the dealer turns the up card **face down**. Then it\'s **round two**: going around again, anyone can name a **different** suit as trump, or pass.'
                },
                {
                    say: 'North dealt and turned down the {QH}. East passed. Your call!',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: '{H} Hearts', feedback: "Hearts got turned down, so it's off the menu this round." },
                            { label: '{D} Diamonds', feedback: "One diamond isn't much to win with." },
                            { label: '{C} Clubs', feedback: 'Clubs makes your {JC} the Right and {JS} the Left, but that\'s only two trumps. You can do better.' },
                            { label: '{S} Spades', correct: true },
                            { label: 'Pass', feedback: "Don't be shy! This hand is loaded in one suit." }
                        ],
                        success: 'Spades! Your {JS} is the Right Bower, the {JC} becomes the Left, and you have the {AS} and {KS} too. Four trumps.'
                    }
                },
                {
                    table: { dealer: 'south', hands: EMPTY_TABLE },
                    seats: ['south'],
                    say: "And if everyone passes again? In this game the dealer is **stuck** and has to name a suit. (The settings menu has a less polite name for this rule.) Some tables redeal instead."
                },
                {
                    table: { dealer: null, upcard: null, upcardDown: false },
                    say: 'Scoring check. Your team called trump and took **4 tricks**. How many points?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: '1 point', correct: true },
                            { label: '2 points', feedback: '2 points is for taking all 5 (a march). With 4, it\'s 1.' },
                            { label: '4 points', feedback: "4 is only for marching alone. That's Level 5 stuff." }
                        ],
                        success: 'Yep. 3 or 4 tricks is 1 point. Take all 5 for 2.'
                    }
                },
                {
                    say: 'Now flip it. West called trump, and **your** team took 3 tricks. What happens?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: 'They score 1', feedback: 'They needed 3 tricks. You took 3, which leaves them only 2.' },
                            { label: 'Nobody scores', feedback: 'Someone always scores. The makers came up short, so...' },
                            { label: 'We score 2', correct: true }
                        ],
                        success: '**Euchred!** The makers only got 2 tricks, so your team scores 2. Nothing feels better.'
                    }
                }
            ]
        },
        {
            id: 'teamwork',
            title: 'Playing as a Team',
            blurb: 'Leading trump, backing up your partner, and calling next.',
            outro: "Level 4 done! You're not just playing cards anymore. You're playing Euchre.",
            steps: [
                {
                    table: { ...CLEAR, hands: FULL_TABLE },
                    seats: ['north'],
                    say: "You know the rules. Now let's win. Your job isn't to win every trick, it's to make sure **your team** gets three."
                },
                {
                    table: { trump: 'clubs', hands: { south: ['9C', 'QC', 'KS', '10D', 'AS'], west: 5, north: 5, east: 5 } },
                    say: 'Clubs are trump. West leads. Keep an eye on your partner.',
                    trick: {
                        leader: 'west',
                        plays: { west: '10H', north: 'AH', east: 'KH' },
                        prompt: "Your partner's {AH} is winning, and you're out of hearts. What do you play?",
                        accept: ['10D'],
                        feedback: {
                            '9C': "Whoa, your partner's already winning! Don't spend trump on a trick your team already has.",
                            QC: "Whoa, your partner's already winning! Don't spend trump on a trick your team already has.",
                            AS: 'Your partner has this one. Save the {AS}: it can win its own trick later.',
                            KS: 'Close! But the {10D} is your only diamond. Toss it and you can trump diamonds later.'
                        },
                        winner: 'north',
                        after: "Your partner takes it, and you kept all your good cards. Golden rule: **don't trump your partner's winner.**"
                    }
                },
                {
                    table: { trump: 'hearts', hands: { south: ['JH', 'AH', '9H', 'AC', '10S'], west: 5, north: 5, east: 5 } },
                    say: "Your team called hearts. When you're the makers, **lead trump early**. It pulls trump out of your opponents' hands so they can't trump your Aces later. Your lead.",
                    trick: {
                        leader: 'south',
                        plays: { west: '10H', north: '9D', east: 'QH' },
                        accept: ['JH'],
                        feedback: {
                            AC: 'Tempting, but someone could trump your Ace. Pull their trump first.',
                            AH: 'Good instinct! But the {JH} is even better. Nobody can beat it.',
                            '9H': 'Right idea, wrong card. Lead your best trump so you\'re sure to win.',
                            '10S': 'Lead trump first! Your team called it, so drag theirs out.'
                        },
                        winner: 'south',
                        after: 'Both opponents had to follow with trump, so now they have less of it. Your {AC} just got a lot safer.'
                    }
                },
                {
                    table: { trump: 'spades', hands: { south: ['AD', 'KD', '10C', '9H', 'QS'], west: 5, north: 5, east: 5 } },
                    say: "Now you're on defense: West called spades. A classic defensive lead is an **off-suit Ace**. Your lead.",
                    trick: {
                        leader: 'south',
                        plays: { west: '9D', north: '10D', east: 'QD' },
                        accept: ['AD'],
                        feedback: {
                            QS: "Leading trump helps the makers get rid of it. Don't do their job for them.",
                            KD: 'The {AD} is a surer thing than the King. Lead your Ace.',
                            '10C': 'Lead your strongest non-trump card. Aces win tricks.',
                            '9H': 'Lead your strongest non-trump card. Aces win tricks.'
                        },
                        winner: 'south',
                        after: 'Ace cashed. You need three tricks to euchre them, so grab the sure ones while you can.'
                    }
                },
                {
                    table: { trump: 'hearts', hands: { south: ['JD', 'KS', '10C'], west: 3, north: 3, east: 3 }, showcase: { cards: ['JH', 'AH', 'KH'], labels: ['Played', 'Played', 'Played'] } },
                    highlight: ['JD'],
                    say: 'Keep count: there are only seven trumps. Hearts are trump, and the {JH}, {AH} and {KH} are already played. Is your {JD} now the highest trump left?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: 'Yes', correct: true },
                            { label: 'No', feedback: 'Think again. Which card beats the Left Bower? Is it still out there?' }
                        ],
                        success: 'Yes! The Right Bower was the only card that beats the Left, and it\'s gone. Counting trump tells you when your cards are unbeatable.'
                    }
                },
                {
                    table: { trump: null, dealer: 'east', upcard: '9D', upcardDown: true, hands: { south: ['JH', 'QH', 'AC', 'KS', '10C'], west: 5, north: 5, east: 5 } },
                    seats: ['east'],
                    say: 'Round two, and East turned down the {9D}. The other suit of the same color, hearts, is called **next**. Sitting left of the dealer, next is often a smart call. Yours?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: '{H} Hearts', correct: true },
                            { label: '{D} Diamonds', feedback: "Diamonds got turned down, so it's off the menu this round." },
                            { label: '{C} Clubs', feedback: 'Two clubs and no bowers. Hearts gives you the Right Bower.' },
                            { label: 'Pass', feedback: "Safe, but this is a textbook next call. You've got the Right Bower in the next suit." }
                        ],
                        success: "Next it is. East's team passed on diamonds, a hint they're short on red Jacks. You've got the {JH} and an Ace on the side."
                    }
                },
                {
                    table: { dealer: null, upcard: null, upcardDown: false, hands: EMPTY_TABLE },
                    say: "Your team-play cheat sheet:\n- Called trump? **Lead it.**\n- Partner winning? **Don't trump it.** Throw junk.\n- On defense, **cash your off-suit Aces.**\n- **Count trumps** as they fall.\n- Left of the dealer in round two? **Think next.**"
                }
            ]
        },
        {
            id: 'advanced',
            title: 'Going Alone',
            blurb: 'Loners for big points, stopping them, and getting stuck as dealer.',
            outro: "That's the whole game. Go take on the table! Tip: in a real game, the trump suit sits in the corners of the table so you never lose track of it.",
            steps: [
                {
                    table: { ...CLEAR, hands: FULL_TABLE },
                    seats: ['north'],
                    say: "Got a monster hand? **Go alone.** When you order up or call trump, you can play without your partner. They sit this hand out.\n- All 5 tricks alone: **4 points**\n- 3 or 4 tricks: 1 point\n- Euchred: 2 points to them"
                },
                {
                    table: { dealer: 'east', upcard: 'QS', hands: { south: ['JS', 'JC', 'AS', 'KS', 'AH'], west: 5, north: 5, east: 5 } },
                    highlight: ['QS'],
                    say: 'East turns up the {QS}, and you go first. Look at that hand. What\'s the play?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: 'Order up, go alone', correct: true },
                            { label: 'Order up with partner', feedback: "You'll probably take all five anyway. Alone, that's 4 points instead of 2. Be brave!" },
                            { label: 'Pass', feedback: "Pass?! That's the top two trumps plus the Ace and King. Order it up, and think bigger." }
                        ],
                        success: 'Loner! With the four best trumps and the {AH} on the side, you can take all five on your own.'
                    }
                },
                {
                    table: { trump: 'spades', upcard: null, sittingOut: 'north', hands: { south: ['JS', 'JC', 'AS', 'KS', 'AH'], west: 5, north: 0, east: 5 } },
                    seats: ['north'],
                    say: "Your partner sits out, so it's you against two, and play skips their seat. Your lead.",
                    trick: {
                        leader: 'south',
                        plays: { west: '9S', east: 'QS' },
                        accept: ['JS', 'JC', 'AS', 'KS'],
                        feedback: {
                            AH: 'Pull their trump first. Lead the {AH} now and someone could trump it.'
                        },
                        winner: 'south',
                        after: 'One down, four to go. Keep leading trump until theirs is gone, then cash the {AH}.'
                    }
                },
                {
                    table: { trump: null, dealer: null, sittingOut: null, hands: EMPTY_TABLE },
                    say: 'Now flip it. When an opponent goes alone, you and your partner team up against one player. How many tricks do you need to **stop the 4-point march**?',
                    ask: {
                        type: 'choice',
                        options: [
                            { label: '1 trick', correct: true },
                            { label: '3 tricks', feedback: '3 would euchre them for 2 points, which is lovely. But you need fewer than that just to stop the march.' },
                            { label: '5 tricks', feedback: 'Dream big, but you need way fewer than that.' }
                        ],
                        success: 'Just one! Take a single trick and their 4-point dream is worth 1 point.'
                    }
                },
                {
                    table: { trump: 'spades', dealer: 'north', sittingOut: 'west', hands: { south: ['AH', '10H', '9C', 'QD', 'KD'], west: 0, north: 5, east: 5 } },
                    seats: ['west'],
                    say: "East is going alone with spades, so West sits out. East leads.",
                    trick: {
                        leader: 'east',
                        plays: { east: 'KH', north: '9H' },
                        prompt: "East's {KH} is on the table. Can you stop the march?",
                        accept: ['AH'],
                        feedback: {
                            '10H': "That can't beat the {KH}. You've got a heart that can."
                        },
                        winner: 'south',
                        after: 'March stopped! One trick, and East\'s loner is worth a single point instead of four.'
                    }
                },
                {
                    table: { trump: null, dealer: 'south', sittingOut: null, upcard: 'KC', upcardDown: true, hands: { south: ['QD', '9D', 'AS', '10H', '9C'], west: 5, north: 5, east: 5 } },
                    seats: ['south'],
                    say: "Last one. You're the dealer, you turned down the {KC}, and everyone passed again. You're **stuck**: you have to name trump. Which suit?",
                    ask: {
                        type: 'choice',
                        options: [
                            { label: '{H} Hearts', feedback: 'Just one heart. Another suit gives you more trump.' },
                            { label: '{D} Diamonds', correct: true },
                            { label: '{C} Clubs', feedback: "Clubs got turned down, so it's off the menu." },
                            { label: '{S} Spades', feedback: "One Ace isn't much trump. Another suit gives you two." },
                            { label: 'Pass', feedback: "Nice try. Stuck means stuck: the dealer can't pass." }
                        ],
                        success: 'Diamonds. Two trumps beat one, and your {AS} still wins on the side. When you\'re stuck, go with your longest suit and trust your partner.'
                    }
                },
                {
                    table: { dealer: null, upcard: null, upcardDown: false, hands: EMPTY_TABLE },
                    say: "That's everything: cards, bowers, bidding, teamwork and loners. Honestly? You're dangerous now."
                }
            ]
        }
    ];

    return Object.freeze({
        SEATS,
        LEVELS,
        parseCard,
        cardCode,
        createTable,
        applyPatch,
        playOrder,
        effectiveSuit,
        checkLegal,
        legalCards,
        trickWinner,
        afterTrick,
        removeFromHand
    });
});
