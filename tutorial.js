/**
 * "How to Play": the lesson picker and the coached practice table.
 *
 * Lessons and the pure table helpers live in tutorial-lessons.js; this file only
 * draws them and handles input. It never touches the real game's state, so a
 * saved game is safe while you practice. It does reuse a few globals from game.js
 * (gameState to check we're on the landing screen, trapFocus, focusIfKeyboard and
 * triggerGameStart), so it loads after game.js.
 *
 * Flow: open() -> level list -> startLevel() -> enterStep() for each step, where a
 * step is either read-and-Next, a quiz (tap a card or pick an answer), or a scripted
 * trick the other seats play out around you. Back restores the table as it was at
 * the start of the previous step, so every step can be replayed.
 */
(() => {
    'use strict';

    const T = window.EuchreTutorial;
    const Rules = window.EuchreRules;
    const progressStore = window.EuchreStorage.createStore();

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const FIRST_PLAY_DELAY = reducedMotion ? 150 : 900;
    const PLAY_DELAY = reducedMotion ? 250 : 750;
    const RESOLVE_DELAY = reducedMotion ? 250 : 650;

    const SEAT_NAMES = { south: 'You', west: 'West', north: 'Your partner', east: 'East' };
    const SUIT_ICONS = { hearts: 'img/suitHeart.svg', diamonds: 'img/suitDiamond.svg', clubs: 'img/suitClub.svg', spades: 'img/suitSpade.svg' };
    const SUIT_LETTERS = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };
    const SUIT_TITLES = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' };
    const isRed = suit => suit === 'hearts' || suit === 'diamonds';

    const $ = id => document.getElementById(id);
    const dom = {
        root: $('tutorial'),
        openBtn: $('how-to-play-btn'),
        backToLevels: $('tut-back-to-levels'),
        close: $('tut-close'),
        eyebrow: $('tut-eyebrow'),
        title: $('tut-title'),
        progress: $('tut-progress'),
        progressFill: $('tut-progress-fill'),
        levels: $('tut-levels'),
        levelList: $('tut-level-list'),
        levelsSummary: $('tut-levels-summary'),
        lesson: $('tut-lesson'),
        table: $('tut-table'),
        trump: $('tut-trump'),
        trick: $('tut-trick'),
        kitty: $('tut-kitty'),
        showcase: $('tut-showcase'),
        hand: $('tut-hand'),
        say: $('tut-say'),
        prompt: $('tut-prompt'),
        feedback: $('tut-feedback'),
        options: $('tut-options'),
        prev: $('tut-prev'),
        next: $('tut-next'),
        hint: $('tut-hint')
    };
    if (!dom.root || !dom.openBtn || !T) return;

    const seatEl = seat => dom.table.querySelector(`.tut-seat[data-seat="${seat}"]`);
    const slotEl = seat => dom.trick.querySelector(`.tut-slot[data-seat="${seat}"]`);

    // ─── State ───────────────────────────────────────────────────────────

    const state = {
        levelIndex: 0,
        stepIndex: 0,
        table: T.createTable(),
        snapshots: [], // table as it was before each step's changes, for Back
        mode: 'read', // read | pick (tap a card) | choice | trick-ready | trick-wait | trick-play | done | complete
        trick: null, // { order, plays, pos } while a trick is running
        run: 0, // bumped on every navigation so stale timers know to stop
        timers: new Set(),
        releaseTrap: null,
        returnFocus: null
    };

    const level = () => T.LEVELS[state.levelIndex];
    const step = () => level().steps[state.stepIndex];

    function later(fn, ms) {
        const run = state.run;
        const id = window.setTimeout(() => {
            state.timers.delete(id);
            if (run === state.run) fn();
        }, ms);
        state.timers.add(id);
    }

    function cancelPending() {
        state.run++;
        state.timers.forEach(id => clearTimeout(id));
        state.timers.clear();
    }

    // ─── Text and cards ──────────────────────────────────────────────────

    function cardName(code, trump = state.table.trump) {
        const card = T.parseCard(code);
        let name = Rules.getCardName(card);
        if (Rules.isRightBower(card, trump)) name += ', Right Bower';
        else if (Rules.isLeftBower(card, trump)) name += ', Left Bower';
        else if (Rules.isCardTrump(card, trump)) name += ', trump';
        return name;
    }

    function suitIcon(suit, className = 'suit-icon') {
        const img = document.createElement('img');
        img.src = SUIT_ICONS[suit];
        img.alt = '';
        img.className = className;
        return img;
    }

    /** {JH} -> an inline card chip, {H} -> a suit symbol. */
    function tokenEl(token) {
        if (SUIT_LETTERS[token]) {
            const suit = SUIT_LETTERS[token];
            const span = document.createElement('span');
            span.className = `tut-suit ${isRed(suit) ? 'red' : 'black'}`;
            span.append(suitIcon(suit));
            return span;
        }
        const card = T.parseCard(token);
        const chip = document.createElement('span');
        chip.className = `tut-chip ${isRed(card.suit) ? 'red' : 'black'}`;
        chip.setAttribute('role', 'img');
        chip.setAttribute('aria-label', Rules.getCardName(card));
        chip.append(card.value, suitIcon(card.suit));
        return chip;
    }

    function appendInline(parent, text) {
        for (const part of text.split(/(\*\*[^*]+\*\*|\{[0-9JQKAHDCS]{1,3}\})/)) {
            if (!part) continue;
            if (part.startsWith('**') && part.endsWith('**')) {
                const strong = document.createElement('strong');
                appendInline(strong, part.slice(2, -2));
                parent.append(strong);
            } else if (/^\{[0-9JQKAHDCS]{1,3}\}$/.test(part)) {
                parent.append(tokenEl(part.slice(1, -1)));
            } else {
                parent.append(part);
            }
        }
    }

    /** Coach text -> paragraphs and lists. Content is ours, but still built with DOM calls, never innerHTML. */
    function richText(text) {
        const frag = document.createDocumentFragment();
        for (const block of text.split('\n\n')) {
            let list = null;
            let para = null;
            for (const line of block.split('\n')) {
                if (line.startsWith('- ')) {
                    if (!list) { list = document.createElement('ul'); frag.append(list); }
                    const li = document.createElement('li');
                    appendInline(li, line.slice(2));
                    list.append(li);
                    para = null;
                } else {
                    if (!para) { para = document.createElement('p'); frag.append(para); }
                    else para.append(document.createElement('br'));
                    appendInline(para, line);
                    list = null;
                }
            }
        }
        return frag;
    }

    function createCard(code, { faceDown = false } = {}) {
        const el = document.createElement('div');
        el.className = 'tut-card';
        if (faceDown) {
            el.classList.add('tut-back');
            el.setAttribute('aria-hidden', 'true');
            return el;
        }
        const card = T.parseCard(code);
        el.classList.add(isRed(card.suit) ? 'red' : 'black');
        el.dataset.code = code;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', cardName(code));
        const corner = document.createElement('span');
        corner.className = 'tut-card-corner';
        corner.setAttribute('aria-hidden', 'true');
        corner.append(card.value, suitIcon(card.suit));
        el.append(corner, suitIcon(card.suit, 'tut-card-pip'));
        return el;
    }

    // ─── Table ───────────────────────────────────────────────────────────

    function renderSeat(seat) {
        const el = seatEl(seat);
        const t = state.table;
        const out = t.sittingOut === seat;
        el.classList.toggle('is-out', out);
        el.classList.toggle('is-glow', (step().seats || []).includes(seat));
        const label = el.querySelector('.tut-seat-label');
        label.replaceChildren(seat === 'south' ? 'You' : seat === 'north' ? 'Partner' : SEAT_NAMES[seat]);
        if (t.dealer === seat) {
            const badge = document.createElement('span');
            badge.className = 'tut-badge';
            badge.textContent = 'Dealer';
            label.append(badge);
        }
        if (out) {
            const badge = document.createElement('span');
            badge.className = 'tut-badge tut-badge-out';
            badge.textContent = 'Sitting out';
            label.append(badge);
        }
        if (seat === 'south') return;
        const hand = t.hands[seat];
        const mini = el.querySelector('.tut-mini-hand');
        const cards = Array.isArray(hand) ? hand.map(code => createCard(code)) : Array.from({ length: out ? 0 : hand }, () => createCard(null, { faceDown: true }));
        cards.forEach((card, i) => card.style.setProperty('--fan', i - (cards.length - 1) / 2));
        mini.replaceChildren(...cards);
        mini.setAttribute('aria-label', Array.isArray(hand) ? '' : `${hand} ${hand === 1 ? 'card' : 'cards'}`);
    }

    function renderHand() {
        const interactive = state.mode === 'pick' || state.mode === 'trick-wait';
        const verb = state.mode === 'pick' && step().ask?.remove ? 'Discard' : state.mode === 'pick' ? 'Choose' : 'Play';
        const cards = state.table.hands.south.map(code => {
            const el = createCard(code);
            if (interactive) {
                el.setAttribute('role', 'button');
                el.setAttribute('aria-label', `${verb} ${cardName(code)}`);
                el.tabIndex = 0;
            }
            return el;
        });
        dom.hand.replaceChildren(...cards);
        dom.hand.classList.toggle('is-active', interactive);
        dom.hand.setAttribute('aria-label', interactive ? 'Your hand: pick a card' : 'Your hand');
    }

    function renderCenter() {
        const t = state.table;
        const showcase = t.showcase;
        dom.table.classList.toggle('has-showcase', !!showcase);
        dom.showcase.hidden = !showcase;
        dom.trick.hidden = !!showcase;
        if (showcase) {
            dom.showcase.replaceChildren(...showcase.cards.map((code, i) => {
                const fig = document.createElement('figure');
                fig.className = 'tut-showcase-item';
                const caption = document.createElement('figcaption');
                caption.textContent = showcase.labels?.[i] || '';
                fig.append(createCard(code), caption);
                return fig;
            }));
        }

        for (const seat of T.SEATS) slotEl(seat).replaceChildren();
        for (const { seat, card } of t.trick) slotEl(seat).append(createCard(card));

        dom.kitty.replaceChildren();
        if (t.upcard) {
            const card = createCard(t.upcard, { faceDown: t.upcardDown });
            const caption = document.createElement('span');
            caption.className = 'tut-kitty-caption';
            if (t.upcardDown) appendInline(caption, `{${t.upcard}} turned down`);
            else caption.textContent = 'Up card';
            dom.kitty.append(card, caption);
        }

        dom.trump.hidden = !t.trump;
        if (t.trump) {
            const name = document.createElement('span');
            name.className = 'tut-trump-name';
            name.textContent = SUIT_TITLES[t.trump];
            dom.trump.replaceChildren('Trump', suitIcon(t.trump), name);
            dom.trump.setAttribute('aria-label', `Trump is ${t.trump}`);
            dom.trump.setAttribute('role', 'img');
        }
    }

    function applyHighlights() {
        const codes = new Set(step().highlight || []);
        dom.table.querySelectorAll('.tut-card[data-code]').forEach(el => el.classList.toggle('is-highlight', codes.has(el.dataset.code)));
    }

    function renderTable() {
        ['north', 'west', 'east', 'south'].forEach(renderSeat);
        renderCenter();
        renderHand();
        applyHighlights();
    }

    // ─── Coach ───────────────────────────────────────────────────────────

    function setSay(text) {
        dom.say.replaceChildren(richText(text));
    }

    function setPrompt(text = '') {
        dom.prompt.replaceChildren();
        if (text) appendInline(dom.prompt, text);
    }

    function setFeedback(text = '') {
        dom.feedback.replaceChildren();
        if (text) appendInline(dom.feedback, text);
    }

    function setNav({ next = false, nextLabel = 'Next', hint = '' } = {}) {
        dom.prev.hidden = state.stepIndex === 0 && state.mode !== 'complete';
        dom.next.hidden = !next;
        dom.next.textContent = nextLabel;
        dom.hint.textContent = hint;
    }

    function setProgress(fraction) {
        const pct = Math.round(fraction * 100);
        dom.progressFill.style.width = `${pct}%`;
        dom.progress.setAttribute('aria-valuenow', String(pct));
    }

    /** The step's interaction is finished: show the payoff and let them move on. */
    function finishStep(text) {
        state.mode = 'done';
        setPrompt();
        if (text) setSay(text);
        dom.hand.classList.remove('is-active');
        renderHand();
        applyHighlights();
        const last = state.stepIndex === level().steps.length - 1;
        setNav({ next: true, nextLabel: last ? 'Finish level' : 'Next' });
        window.focusIfKeyboard?.(dom.next);
    }

    function nudge(el) {
        if (!el || reducedMotion) return;
        el.classList.remove('is-shake');
        void el.offsetWidth;
        el.classList.add('is-shake');
    }

    // ─── Steps ───────────────────────────────────────────────────────────

    function enterStep(index) {
        cancelPending();
        state.stepIndex = index;
        state.snapshots[index] = state.table;
        state.table = T.applyPatch(state.table, step().table);
        state.trick = null;

        const s = step();
        state.mode = s.trick ? 'trick-play' : s.ask?.type === 'card' ? 'pick' : s.ask?.type === 'choice' ? 'choice' : 'read';

        dom.eyebrow.textContent = `Level ${state.levelIndex + 1} of ${T.LEVELS.length}`;
        setProgress(index / level().steps.length);
        setSay(s.say);
        setPrompt();
        setFeedback();
        renderTable();
        renderOptions();

        if (state.mode === 'read') {
            setNav({ next: true });
            window.focusIfKeyboard?.(dom.next);
        } else if (state.mode === 'pick') {
            setNav({ hint: 'Tap a card in your hand' });
            focusFirstHandCard();
        } else if (state.mode === 'choice') {
            setNav();
            window.focusIfKeyboard?.(dom.options.querySelector('button'));
        } else if (s.trick.leader === 'south') {
            // You lead, so nothing moves until you tap a card
            startTrick();
        } else {
            // Others play first: wait until the player has read the setup and asks for it
            state.mode = 'trick-ready';
            setNav({ next: true, nextLabel: 'Play the trick' });
            window.focusIfKeyboard?.(dom.next);
        }
    }

    function renderOptions() {
        const ask = step().ask;
        dom.options.replaceChildren();
        dom.options.classList.remove('is-finish');
        dom.options.hidden = state.mode !== 'choice';
        if (state.mode !== 'choice') return;
        for (const option of ask.options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tut-option';
            appendInline(btn, option.label);
            btn.addEventListener('click', () => answerChoice(option, btn));
            dom.options.append(btn);
        }
    }

    function answerChoice(option, btn) {
        if (state.mode !== 'choice') return;
        if (option.correct) {
            dom.options.querySelectorAll('button').forEach(b => { b.disabled = true; });
            btn.classList.add('is-correct');
            btn.setAttribute('aria-label', `${btn.textContent}, correct`);
            setFeedback();
            finishStep(step().ask.success || option.feedback);
            return;
        }
        btn.classList.add('is-wrong');
        btn.disabled = true;
        setFeedback(option.feedback);
        nudge(btn);
        // Keep focus inside the answers for keyboard users once the pressed one is disabled
        window.focusIfKeyboard?.(dom.options.querySelector('button:not(:disabled)'));
    }

    function focusFirstHandCard() {
        window.focusIfKeyboard?.(dom.hand.querySelector('[role="button"]'));
    }

    // Tap or Enter on a card in your hand
    function pickCard(code, el) {
        if (state.mode === 'pick') {
            const ask = step().ask;
            if (!ask.accept.includes(code)) {
                setFeedback(ask.feedback?.[code] || ask.fallback || 'Not quite. Have another look.');
                nudge(el);
                return;
            }
            setFeedback();
            if (ask.remove) state.table = T.removeFromHand(state.table, code);
            finishStep(ask.success);
            if (!ask.remove) dom.hand.querySelector(`[data-code="${code}"]`)?.classList.add('is-winner');
            return;
        }
        if (state.mode !== 'trick-wait') return;

        const trick = step().trick;
        const lead = state.trick.plays[0]?.card || null;
        const legal = T.checkLegal(code, state.table.hands.south, lead, state.table.trump);
        if (!legal.ok) {
            setFeedback(legal.reason);
            nudge(el);
            return;
        }
        if (trick.accept !== 'any' && !trick.accept.includes(code)) {
            setFeedback(trick.feedback?.[code] || trick.fallback || 'That works, but there\'s a better card. Try again.');
            nudge(el);
            return;
        }
        setFeedback();
        state.mode = 'trick-play';
        state.table = T.removeFromHand(state.table, code);
        renderHand();
        playToTrick('south', code);
    }

    // ─── Tricks ──────────────────────────────────────────────────────────

    function startTrick() {
        const { leader } = step().trick;
        state.trick = { order: T.playOrder(leader, state.table.sittingOut), plays: [], pos: 0 };
        later(advanceTrick, FIRST_PLAY_DELAY);
    }

    function advanceTrick() {
        const trick = step().trick;
        const { order, pos } = state.trick;
        if (pos >= order.length) {
            later(resolveTrick, RESOLVE_DELAY);
            return;
        }
        const seat = order[pos];
        if (seat === 'south') {
            state.mode = 'trick-wait';
            // Keep the lesson text up; the prompt gets its own line under it
            setPrompt(trick.prompt || (pos === 0 ? 'Your lead: tap a card.' : 'Your turn: tap a card.'));
            setNav();
            renderHand();
            applyHighlights();
            focusFirstHandCard();
            return;
        }
        playToTrick(seat, trick.plays[seat]);
    }

    function playToTrick(seat, code) {
        state.trick.plays.push({ seat, card: code });
        state.trick.pos++;
        const card = createCard(code);
        card.classList.add('is-played');
        slotEl(seat).replaceChildren(card);
        if (seat !== 'south') {
            // Face-down counts shrink as the other seats play
            state.table = T.afterTrick(state.table, [{ seat, card: code }]);
            renderSeat(seat);
        }
        if (state.trick.pos < state.trick.order.length) {
            if (state.trick.order[state.trick.pos] === 'south') advanceTrick();
            else later(advanceTrick, PLAY_DELAY);
        } else {
            later(resolveTrick, RESOLVE_DELAY);
        }
    }

    function resolveTrick() {
        const { plays } = state.trick;
        const winner = T.trickWinner(plays, state.table.trump);
        for (const { seat } of plays) {
            const card = slotEl(seat).querySelector('.tut-card');
            card?.classList.toggle('is-winner', seat === winner);
            card?.classList.toggle('is-dim', seat !== winner);
        }
        const winnerSlot = slotEl(winner);
        const tag = document.createElement('span');
        tag.className = 'tut-win-tag';
        tag.textContent = winner === 'south' ? 'You win' : `${SEAT_NAMES[winner]} wins`;
        winnerSlot.append(tag);
        seatEl(winner).classList.add('is-glow');
        finishStep(step().trick.after);
    }

    // ─── Levels ──────────────────────────────────────────────────────────

    function completed() {
        return new Set(progressStore.loadTutorial().completed);
    }

    function showLevels() {
        cancelPending();
        state.mode = 'levels';
        dom.lesson.hidden = true;
        dom.levels.hidden = false;
        dom.backToLevels.hidden = true;
        dom.progress.hidden = true;
        dom.eyebrow.hidden = true;
        dom.title.textContent = 'How to Play';

        const done = completed();
        const upNext = T.LEVELS.findIndex(l => !done.has(l.id));
        const doneCount = T.LEVELS.filter(l => done.has(l.id)).length;
        dom.levelsSummary.textContent = doneCount === 0
            ? ''
            : doneCount === T.LEVELS.length
                ? 'All five done. You\'re a Euchre graduate. Replay any lesson for a refresher.'
                : `${doneCount} of ${T.LEVELS.length} done. Nice going.`;
        dom.levelsSummary.hidden = doneCount === 0;

        dom.levelList.replaceChildren(...T.LEVELS.map((l, i) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tut-level';
            const isDone = done.has(l.id);
            if (isDone) btn.classList.add('is-done');
            if (i === upNext) btn.classList.add('is-next');

            const num = document.createElement('span');
            num.className = 'tut-level-num';
            num.setAttribute('aria-hidden', 'true');
            num.textContent = isDone ? '' : String(i + 1);

            const text = document.createElement('span');
            text.className = 'tut-level-text';
            const title = document.createElement('span');
            title.className = 'tut-level-title';
            title.textContent = l.title;
            const blurb = document.createElement('span');
            blurb.className = 'tut-level-blurb';
            blurb.textContent = l.blurb;
            text.append(title, blurb);

            const status = document.createElement('span');
            status.className = 'tut-level-status';
            status.textContent = isDone ? 'Replay' : i === upNext ? (doneCount ? 'Up next' : 'Start here') : `${l.steps.length} steps`;

            btn.append(num, text, status);
            btn.setAttribute('aria-label', `Level ${i + 1}: ${l.title}. ${l.blurb} ${isDone ? 'Completed.' : ''}`.trim());
            btn.addEventListener('click', () => startLevel(i));
            li.append(btn);
            return li;
        }));
        const focusTarget = dom.levelList.querySelector('.is-next') || dom.levelList.querySelector('button');
        focusTarget?.focus({ preventScroll: true });
    }

    function startLevel(index) {
        state.levelIndex = index;
        state.table = T.createTable();
        state.snapshots = [];
        dom.levels.hidden = true;
        dom.lesson.hidden = false;
        dom.backToLevels.hidden = false;
        dom.progress.hidden = false;
        dom.eyebrow.hidden = false;
        dom.title.textContent = level().title;
        dom.lesson.scrollTop = 0;
        enterStep(0);
    }

    function completeLevel() {
        cancelPending();
        state.mode = 'complete';
        progressStore.completeTutorialLevel(level().id);
        setProgress(1);
        setFeedback();
        dom.options.hidden = false;
        dom.hand.classList.remove('is-active');
        setPrompt();
        setSay(level().outro);
        renderCelebration();

        const nextLevel = T.LEVELS[state.levelIndex + 1];
        const primary = document.createElement('button');
        primary.type = 'button';
        primary.className = 'tut-btn tut-btn-primary';
        if (nextLevel) {
            primary.textContent = `Next: ${nextLevel.title}`;
            primary.addEventListener('click', () => startLevel(state.levelIndex + 1));
        } else {
            primary.textContent = 'Play a real game';
            primary.addEventListener('click', playForReal);
        }
        const secondary = document.createElement('button');
        secondary.type = 'button';
        secondary.className = 'tut-btn tut-btn-quiet';
        secondary.textContent = 'All lessons';
        secondary.addEventListener('click', showLevels);
        dom.options.replaceChildren(primary, secondary);
        dom.options.classList.add('is-finish');
        setNav();
        dom.prev.hidden = true;
        primary.focus({ preventScroll: true });
    }

    /** The finish card's table: the two bowers, fanned, over a row of level dots. */
    function renderCelebration() {
        const done = completed();
        const wrap = document.createElement('div');
        wrap.className = 'tut-celebrate';
        const cards = document.createElement('div');
        cards.className = 'tut-celebrate-cards';
        cards.setAttribute('aria-hidden', 'true');
        cards.append(createCard('JD'), createCard('JH'));
        const title = document.createElement('p');
        title.className = 'tut-celebrate-title';
        title.textContent = done.size === T.LEVELS.length && !T.LEVELS[state.levelIndex + 1] ? 'You graduated!' : `Level ${state.levelIndex + 1} complete`;
        const dots = document.createElement('ol');
        dots.className = 'tut-celebrate-dots';
        dots.setAttribute('aria-label', `${T.LEVELS.filter(l => done.has(l.id)).length} of ${T.LEVELS.length} levels done`);
        dots.append(...T.LEVELS.map(l => {
            const li = document.createElement('li');
            if (done.has(l.id)) li.className = 'is-done';
            return li;
        }));
        wrap.append(cards, title, dots);

        for (const seat of T.SEATS) slotEl(seat).replaceChildren();
        dom.hand.replaceChildren();
        dom.trump.hidden = true;
        dom.table.classList.add('has-showcase');
        dom.trick.hidden = true;
        dom.showcase.hidden = false;
        dom.showcase.replaceChildren(wrap);
    }

    // ─── Open and close ──────────────────────────────────────────────────

    const pageRegions = () => [document.querySelector('.game-header'), document.querySelector('.game-container')].filter(Boolean);

    function open() {
        if (typeof gameState !== 'undefined' && gameState.gamePhase !== 'setup') return;
        window.cancelFastForward?.();
        state.returnFocus = document.activeElement;
        dom.root.hidden = false;
        document.body.classList.add('tutorial-open');
        pageRegions().forEach(el => { el.inert = true; });
        state.releaseTrap = typeof trapFocus === 'function' ? trapFocus(dom.root, close) : null;
        showLevels();
    }

    function close() {
        cancelPending();
        state.releaseTrap?.();
        state.releaseTrap = null;
        dom.root.hidden = true;
        document.body.classList.remove('tutorial-open');
        pageRegions().forEach(el => { el.inert = false; });
        state.returnFocus?.focus?.({ preventScroll: true });
    }

    function playForReal() {
        close();
        if (typeof triggerGameStart === 'function') triggerGameStart();
    }

    // ─── Wiring ──────────────────────────────────────────────────────────

    dom.openBtn.addEventListener('click', open);
    dom.close.addEventListener('click', close);
    dom.backToLevels.addEventListener('click', showLevels);

    dom.next.addEventListener('click', () => {
        if (state.mode === 'trick-ready') {
            state.mode = 'trick-play';
            setNav({ hint: 'Watch the table' });
            startTrick();
            return;
        }
        if (state.mode !== 'read' && state.mode !== 'done') return;
        if (state.stepIndex < level().steps.length - 1) enterStep(state.stepIndex + 1);
        else completeLevel();
    });

    dom.prev.addEventListener('click', () => {
        if (state.stepIndex === 0 || state.mode === 'complete') return;
        state.table = state.snapshots[state.stepIndex - 1];
        enterStep(state.stepIndex - 1);
    });

    dom.hand.addEventListener('click', e => {
        const el = e.target.closest('.tut-card[role="button"]');
        if (el) pickCard(el.dataset.code, el);
    });

    // Arrow keys move along your hand, Enter or Space picks
    dom.hand.addEventListener('keydown', e => {
        const cards = [...dom.hand.querySelectorAll('.tut-card[role="button"]')];
        const i = cards.indexOf(document.activeElement);
        if (i === -1) return;
        const moves = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: cards.length - 1 };
        if (e.key in moves) {
            e.preventDefault();
            cards[(moves[e.key] + cards.length) % cards.length].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            cards[i].click();
        }
    });
})();
