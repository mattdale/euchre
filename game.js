const CROWN = '👑';

// Game state
let gameState = {
    deck: [],
    playerHand: [],
    computerHands: [[], [], []],
    currentPlayer: 0,
    dealer: 0,
    trumpSuit: null,
    trumpCandidate: null, // The flipped card that could become trump
    currentTrick: [],
    leadSuit: null,
    cardsPlayed: 0,
    isProcessingTurn: false,
    isProcessingTrick: false,
    gamePhase: 'setup', // setup, bidding, playing, discarding, complete
    maker: null, // Player who ordered up or called trump
    makerIsAlone: false, // Is the maker going alone?
    partnerSittingOut: null, // The partner who is sitting out (if maker is going alone)
    isProcessingTrick: false,
    score: [0, 0], // Team scores [team1, team2]
    biddingRound: 1, // 1 = order up round, 2 = call trump round
    passedPlayers: [], // Track who has passed
    // Euchre hand tracking
    makerTeam: null, // 0 = You+Teammate, 1 = Fucker1+Fucker2
    makerIndex: null, // Which player (0-3) made trump
    makerIsAlone: false, // True if maker is going alone
    tricksThisHand: { team0: 0, team1: 0 }, // Tricks won this hand by each team
    tricksPlayed: 0, // Number of tricks played this hand (0-5)
    trumpPlayed: [], // Track which trump cards have been played this hand (for Intense AI)
    suitsVoidByPlayer: [[], [], [], []], // Track which suits each player has shown void in
    gamePhase: 'dealing', // 'dealing', 'bidding', 'discarding', 'playing', 'hand_complete'
    settings: {
        winningScore: 10,
        stickTheDealer: true,
        beginnerMode: false,
        difficulty: 'intense'
    }
};

// Card suits and values
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_SYMBOLS = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠'
};

// DOM Elements
const playerHandEl = document.getElementById('player-hand');
const northHandEl = document.getElementById('north-hand');
const eastHandEl = document.getElementById('east-hand');
const westHandEl = document.getElementById('west-hand');
const trickCardsEl = document.getElementById('trick-cards');
const trumpCardEl = document.getElementById('trump-card');
const scoreEl = document.getElementById('score');
const trumpDisplayEl = document.getElementById('trump-display');
const messageEl = document.getElementById('message');
const team1TallyCrowns = document.getElementById('team1-tally-crowns');
const team2TallyCrowns = document.getElementById('team2-tally-crowns');
// Removed new game button
// Removed static order-up and pass buttons - now using contextual dialog buttons
// Start game button removed - now using deck click
// Removed start game overlay - now just using the button directly
const rulePopup = document.getElementById('rule-popup');
const rulePopupMessage = document.getElementById('rule-popup-message');
const aiDecisionPopup = document.getElementById('ai-decision-popup');
const aiDecisionMessage = document.getElementById('ai-decision-message');
const userTurnDialog = document.getElementById('user-turn-dialog');
const userTurnMessage = document.getElementById('user-turn-message');
const userTurnTitle = document.getElementById('user-turn-title');
const suitSelection = document.getElementById('suit-selection');
// Discard pile removed
const dialogActions = document.getElementById('dialog-actions');
const dialogOrderUp = document.getElementById('dialog-order-up');
const dialogPass = document.getElementById('dialog-pass');

// Player hand elements array for easy access (in clockwise order)
const handElements = [playerHandEl, westHandEl, northHandEl, eastHandEl];

// Switch the header container to show the trick tally scoreboard
function showTrickTallyMode() {
    // Keep message visible, just update tallies
    updateTrickTallyDisplay();
}

// Switch the header container back to plain text message mode
function showMessageMode() {
    // No-op - tally crowns stay visible until reset
}

// Re-render the crown marks for each team based on current tricksThisHand
function updateTrickTallyDisplay() {
    if (!team1TallyCrowns || !team2TallyCrowns) return;

    // Update team 1 crowns
    const t1Crowns = team1TallyCrowns.querySelectorAll('.tally-crown');
    t1Crowns.forEach((crown, i) => {
        if (i < gameState.tricksThisHand.team0) {
            crown.classList.add('won');
        } else {
            crown.classList.remove('won');
        }
    });

    // Update team 2 crowns
    const t2Crowns = team2TallyCrowns.querySelectorAll('.tally-crown');
    t2Crowns.forEach((crown, i) => {
        if (i < gameState.tricksThisHand.team1) {
            crown.classList.add('won');
        } else {
            crown.classList.remove('won');
        }
    });
}

// Start a new game (called when deck is clicked)
function startNewGame() {
    // Show starting message
    messageEl.textContent = 'Starting game...';

    // Pause briefly, then select dealer and start game
    setTimeout(() => {
        selectRandomDealer();
    }, 1000); // 1 second pause
}

// Select a random dealer and show dealer badge
function selectRandomDealer() {
    // Randomly select dealer (0-3)
    gameState.dealer = Math.floor(Math.random() * 4);
    const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];

    // Show dealer selection message with proper grammar
    let dealerMessage;
    if (gameState.dealer === 0) {
        dealerMessage = 'You are the dealer!';
    } else {
        dealerMessage = `${playerNames[gameState.dealer]} is the dealer!`;
    }
    messageEl.textContent = dealerMessage;

    // Update dealer badges
    updateDealerBadges();

    // Pause to show dealer, then start dealing
    setTimeout(() => {
        initGame();
    }, 1500); // 1.5 second pause to show dealer
}

// Initialize the game
function initGame() {
    // Reset game state
    gameState.deck = createDeck();
    gameState.playerHand = [];
    gameState.computerHands = [[], [], []];
    // Bidding starts with player to the left of dealer (clockwise)
    // Clockwise order: 0(You/South) -> 1(Fucker 1/West) -> 2(Teammate/North) -> 3(Fucker 2/East)
    gameState.currentPlayer = (gameState.dealer + 1) % 4;
    gameState.trumpSuit = null;
    gameState.trumpCandidate = null;
    gameState.currentTrick = [];
    gameState.leadSuit = null;
    gameState.cardsPlayed = 0;
    gameState.isProcessingTurn = false;
    gameState.trickWinner = null;
    gameState.biddingRound = 1;
    gameState.passedPlayers = [];
    // Reset hand tracking
    gameState.makerTeam = null;
    gameState.makerIndex = null;
    gameState.makerIsAlone = false;
    gameState.partnerSittingOut = null; // Reset partner sitting out
    gameState.tricksThisHand = { team0: 0, team1: 0 };
    gameState.tricksPlayed = 0;
    gameState.trumpPlayed = [];
    gameState.suitsVoidByPlayer = [[], [], [], []];
    gameState.gamePhase = 'bidding';

    // Clear all trick piles
    clearAllTrickPiles();

    // Clear trick tally marks
    clearTrickTallies();

    // Show all hands (reset visibility from going alone)
    updatePartnerHandVisibility();

    // Hide trump area until trump is determined
    hideTrumpArea();

    // Update UI and turn indicators
    updateUI();
    updateTurnIndicators();
    messageEl.textContent = 'Dealing cards...';

    // Deal cards
    dealCards();

    // Bidding will start after trump candidate is shown (handled in showTrumpCandidate)
    // Cards take 20 * 200ms = 4000ms to deal, plus extra time for trump candidate
    // setTimeout(startBidding, 5000); // REMOVED - duplicate call
}

// Create a standard deck of 24 cards (9-Ace of each suit)
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ suit, value });
        }
    }
    return shuffleDeck(deck);
}

// Shuffle the deck using Fisher-Yates algorithm
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Deal cards to all players with animation in Euchre style (3-2-3-2)
function dealCards() {
    // Clear all hands first
    $('.hand').empty();

    // Ensure all hand containers are visible (reset from going alone)
    const handElements = [playerHandEl, westHandEl, northHandEl, eastHandEl];
    handElements.forEach(handEl => {
        if (handEl) handEl.style.display = '';
    });

    // Show the deck in the center first
    showDeckInCenter();

    // Small delay to ensure deck is fully rendered before dealing starts
    let dealDelay = 2; // Start with delay of 2 to give deck time to render

    // Euchre dealing pattern: Round 1 (3-2-3-2), Round 2 (2-3-2-3)
    const dealingRounds = [
        [3, 2, 3, 2], // First round
        [2, 3, 2, 3]  // Second round
    ];

    // Deal in two rounds following Euchre pattern
    // Start with player to the left of dealer and go clockwise
    for (let round = 0; round < 2; round++) {
        for (let i = 0; i < 4; i++) {
            // Calculate actual player index starting from dealer's left going clockwise
            const playerIndex = (gameState.dealer + 1 + i) % 4;
            const cardsThisRound = dealingRounds[round][i];

            for (let cardNum = 0; cardNum < cardsThisRound; cardNum++) {
                const card = gameState.deck.pop();

                // Add to appropriate hand
                if (playerIndex === 0) {
                    gameState.playerHand.push(card);
                } else {
                    gameState.computerHands[playerIndex - 1].push(card);
                }

                // Animate dealing each card from center
                setTimeout(() => {
                    animateCardFromCenter(card, playerIndex, dealDelay);
                }, dealDelay * 150); // Reduced from 200ms to 150ms for faster dealing

                dealDelay++;
            }
        }
    }

    // The top card of the remaining deck is the potential trump
    console.log('Deck length before trump candidate:', gameState.deck.length);
    const topCard = gameState.deck.pop();
    if (topCard) {
        gameState.deck.push(topCard); // Put it back for now
        gameState.trumpCandidate = topCard; // Set it immediately
        console.log('Trump candidate set:', topCard);
    } else {
        console.error('No cards left in deck for trump candidate!');
    }

    // Debug: Log hand sizes after dealing
    console.log('After dealing - Player hand size:', gameState.playerHand.length);
    console.log('After dealing - Computer hands:', gameState.computerHands.map(hand => hand.length));
    console.log('After dealing - Deck remaining:', gameState.deck.length);

    // After all cards are dealt, show trump candidate (keep deck visible)
    setTimeout(() => {
        showTrumpCandidate();
    }, (dealDelay + 2) * 150 + 500);
}

// Start the bidding phase
function startBidding() {
    const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];
    console.log('=== startBidding called ===');
    console.log('Current player:', gameState.currentPlayer, '(' + playerNames[gameState.currentPlayer] + ')');
    console.log('Passed players:', gameState.passedPlayers);

    // If trump is already set, don't continue bidding
    if (gameState.trumpSuit) {
        console.log('Trump already set, ending bidding phase');
        return;
    }

    // Check if current player has already passed this round
    if (gameState.passedPlayers.includes(gameState.currentPlayer)) {
        // Move to next player who hasn't passed yet (clockwise)
        const nextPlayerClockwise = [1, 2, 3, 0]; // Next player for each current player index
        let nextPlayer = nextPlayerClockwise[gameState.currentPlayer];
        let attempts = 0;
        while (gameState.passedPlayers.includes(nextPlayer) && attempts < 4) {
            nextPlayer = nextPlayerClockwise[nextPlayer];
            attempts++;
        }

        // If all players have passed, handle end of round
        if (attempts >= 4 || gameState.passedPlayers.length >= 4) {
            if (gameState.biddingRound === 1) {
                // All passed on ordering up, start second round (calling trump)
                gameState.biddingRound = 2;
                gameState.passedPlayers = [];
                // Second round also starts with player to left of dealer (clockwise)
                gameState.currentPlayer = (gameState.dealer + 1) % 4;
                messageEl.textContent = 'All passed. Now players can call trump suit...';
                setTimeout(startBidding, 1400);
            } else {
                // All passed on calling trump, deal new hand with next dealer
                gameState.dealer = (gameState.dealer + 1) % 4;
                messageEl.textContent = 'All players passed. New dealer, starting a new round...';
                updateDealerBadges();
                setTimeout(initGame, 1400);
            }
            return;
        }

        gameState.currentPlayer = nextPlayer;
    }

    // Update turn indicators to show current player
    updateTurnIndicators();

    if (gameState.biddingRound === 1) {
        // First round: Order up the candidate
        const candidateCard = gameState.trumpCandidate;
        const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];
        if (!candidateCard) {
            console.error('No trump candidate available for bidding');
            messageEl.textContent = 'Error: No trump candidate available';
            return;
        }

        // Show dialog or start computer turn
        if (gameState.currentPlayer === 0) {
            messageEl.textContent = `Your turn. Order up ${getCardName(candidateCard)}?`;
            // Show prominent user turn dialog with bidding buttons
            showUserTurnDialog(`Order up ${getCardName(candidateCard)}?`, 'bidding');
        } else {
            console.log('=== Starting computer turn ===');
            console.log('Player:', gameState.currentPlayer, '(' + playerNames[gameState.currentPlayer] + ')');
            console.log('Bidding round:', gameState.biddingRound);
            messageEl.textContent = `${playerNames[gameState.currentPlayer]}'s turn. Order up ${getCardName(candidateCard)}?`;
            setTimeout(computerBid, 1950); // Sped up for slightly faster AI thinking
        }
    } else {
        // Second round: Call trump suit
        const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];

        // Check if we're at the dealer and everyone else has passed (Stick the Dealer)
        const isStickTheDealer = gameState.settings.stickTheDealer && gameState.currentPlayer === gameState.dealer &&
            gameState.passedPlayers.length === 3;

        if (gameState.currentPlayer === 0) {
            if (isStickTheDealer) {
                messageEl.textContent = `You must name trump! (Stick the Dealer rule)`;
                // Show suit selection - dealer MUST pick
                showUserTurnDialog('You must name trump:', 'suit_selection_forced');
            } else {
                messageEl.textContent = `Your turn. Call trump suit?`;
                // Show suit selection in dialog with instruction about going alone
                showUserTurnDialog('Choose a trump suit (hold Shift to go alone):', 'suit_selection');
            }
        } else {
            if (isStickTheDealer) {
                messageEl.textContent = `${playerNames[gameState.currentPlayer]} must name trump! (Stick the Dealer)`;
            } else {
                messageEl.textContent = `${playerNames[gameState.currentPlayer]}'s turn. Call trump suit?`;
            }
            setTimeout(computerCallTrump, 1950); // Sped up for slightly faster AI thinking
        }
    }
}

// Computer makes a bid
function computerBid() {
    // GUARD: Prevent overlapping AI turns
    if (gameState.isProcessingTurn) {
        console.log('AI tried to bid while turn is already processing - skipping');
        return;
    }

    // GUARD: If it's the player's turn, don't let AI bid
    if (gameState.currentPlayer === 0) {
        console.log('AI tried to bid on player turn - skipping');
        return;
    }

    gameState.isProcessingTurn = true;
    gameState.lastStateChange = Date.now();

    console.log('computerBid called for player:', gameState.currentPlayer);

    // Prevent duplicate calls if trump is already set
    if (gameState.trumpSuit) {
        console.log('Trump already set, ignoring computerBid call');
        gameState.isProcessingTurn = false;
        return;
    }
    if (gameState.biddingRound === 1) {
        const candidateCard = gameState.trumpCandidate;
        const playerHand = gameState.computerHands[gameState.currentPlayer - 1];

        if (!candidateCard || !playerHand || playerHand.length === 0) {
            showAIDecision(gameState.currentPlayer, 'pass');
            setTimeout(() => pass(), 1400);
            return;
        }

        const difficulty = gameState.settings.difficulty || 'casual';
        const strength = evaluateHandStrength(playerHand, candidateCard.suit);
        const isDealer = gameState.currentPlayer === gameState.dealer;
        const isPartnerOfDealer = gameState.currentPlayer === getPartnerIndex(gameState.dealer);
        const seatRelativeToDealer = (gameState.currentPlayer - gameState.dealer + 4) % 4; // 1=S1, 2=S2, 3=S3, 0=dealer

        // Check for bowers in hand (for this potential trump suit)
        const hasBower = playerHand.some(c => c.value === 'J' && (c.suit === candidateCard.suit || getEffectiveSuit(c, candidateCard.suit) === candidateCard.suit));

        // Thresholds for ordering up
        let orderUpThreshold = 7;
        let aloneThreshold = 14;

        if (difficulty === 'casual') {
            orderUpThreshold = 10;
            aloneThreshold = 17;
        } else if (difficulty === 'intermediate') {
            orderUpThreshold = 8;
            aloneThreshold = 15;
        }

        // Advanced positional modifiers for "Intense" mode
        if (difficulty === 'intense') {
            if (isDealer) {
                // Dealer: most powerful position — gets the card + discard
                orderUpThreshold -= 2;
            } else if (isPartnerOfDealer) {
                // S2 (Partner of dealer): "Assisting" gives dealer a free trump + discard
                // Can be more liberal with light hands (2 trump + Ace is enough)
                orderUpThreshold -= 1;
            } else if (seatRelativeToDealer === 1) {
                // S1 (Left of dealer): ordering up gives the dealer a card — need strong hand
                orderUpThreshold += 1;
                // But if we have a bower, that offsets the positional disadvantage
                if (hasBower) orderUpThreshold -= 1;
            } else if (seatRelativeToDealer === 3) {
                // S3 (Right of dealer): most cautious position — ordering across the dealer
                orderUpThreshold += 2;
                if (hasBower) orderUpThreshold -= 1;
            }

            // Score pressure: at 9 points, get aggressive to close out
            const myTeam = (gameState.currentPlayer === 0 || gameState.currentPlayer === 2) ? 0 : 1;
            const opponentTeam = 1 - myTeam;
            if (gameState.score[myTeam] >= 9) orderUpThreshold -= 2; // We need 1 point to win
            if (gameState.score[opponentTeam] >= 9) orderUpThreshold -= 1; // Opponents are close — be aggressive

            // Loner decision: need both bowers or very dominant hand
            const hasRightBower = playerHand.some(c => c.value === 'J' && c.suit === candidateCard.suit);
            const hasLeftBower = playerHand.some(c => c.value === 'J' && getEffectiveSuit(c, candidateCard.suit) === candidateCard.suit && c.suit !== candidateCard.suit);
            if (hasRightBower && hasLeftBower && strength >= aloneThreshold) {
                // Both bowers + strong hand = go alone
            } else {
                aloneThreshold = 999; // Don't go alone without both bowers (on Intense)
            }
        }

        let shouldOrderUp = strength >= orderUpThreshold;

        // Random element for variety (much less random in Intense)
        const randomness = difficulty === 'casual' ? 0.3 : (difficulty === 'intermediate' ? 0.15 : 0.03);
        if (Math.random() < randomness) shouldOrderUp = !shouldOrderUp;

        const shouldGoAlone = strength >= aloneThreshold;

        if (shouldOrderUp) {
            const decision = shouldGoAlone ? 'order_up_alone' : 'order_up';
            showAIDecision(gameState.currentPlayer, decision, candidateCard.suit);
            setTimeout(() => orderUp(candidateCard.suit, shouldGoAlone), 2500);
        } else {
            showAIDecision(gameState.currentPlayer, 'pass');
            setTimeout(() => pass(), 2500);
        }
    } else {
        // Round 2 - calling trump
        computerCallTrump();
    }
}

// Computer calls trump in second round
function computerCallTrump() {
    // GUARD: Prevent overlapping AI turns
    if (gameState.isProcessingTurn) {
        console.log('AI tried to call trump while turn is already processing - skipping');
        return;
    }

    // GUARD: If it's the player's turn, don't let AI play
    if (gameState.currentPlayer === 0) {
        console.log('AI tried to call trump on player turn - skipping');
        return;
    }

    gameState.isProcessingTurn = true;
    gameState.lastStateChange = Date.now();

    console.log('computerCallTrump called for player:', gameState.currentPlayer);

    // Prevent duplicate calls if trump is already set
    if (gameState.trumpSuit) {
        console.log('Trump already set, ignoring computerCallTrump call');
        gameState.isProcessingTurn = false;
        return;
    }

    // AI: Pick the best suit (excluding candidate suit) with advanced strategy
    const hand = gameState.computerHands[gameState.currentPlayer - 1];
    if (!hand || hand.length === 0) {
        showAIDecision(gameState.currentPlayer, 'pass');
        setTimeout(() => pass(), 1400);
        return;
    }

    const difficulty = gameState.settings.difficulty || 'casual';
    const candidateSuit = gameState.trumpCandidate.suit;
    const availableSuits = SUITS.filter(suit => suit !== candidateSuit);

    // Evaluate strength for each available suit
    const suitStrengths = {};
    availableSuits.forEach(suit => {
        suitStrengths[suit] = evaluateHandStrength(hand, suit);
    });

    // Find best suit
    let bestSuit = availableSuits.reduce((a, b) =>
        suitStrengths[a] > suitStrengths[b] ? a : b
    );

    const isStickTheDealer = gameState.settings.stickTheDealer && gameState.currentPlayer === gameState.dealer &&
        gameState.passedPlayers.length === 3;

    // Advanced strategy: "Next" and "Green/Cross" for Intense
    let bestStrength = suitStrengths[bestSuit];
    const nextSuit = getNextSuit(candidateSuit);
    const crossSuits = getCrossSuits(candidateSuit);

    if (difficulty === 'intense' && !isStickTheDealer) {
        const firstPlayerAfterDealer = (gameState.dealer + 1) % 4;
        const thirdPlayerAfterDealer = (gameState.dealer + 3) % 4;

        // "Next" strategy: S1 and S3 should aggressively call the same-color suit
        // Rationale: dealer turned down the candidate, so bowers of that COLOR are likely in partner's hand
        if (gameState.currentPlayer === firstPlayerAfterDealer || gameState.currentPlayer === thirdPlayerAfterDealer) {
            const nextStrength = suitStrengths[nextSuit];
            if (nextStrength >= 4) { // Very low threshold for "Next" — statistically strong play
                bestSuit = nextSuit;
                bestStrength = nextStrength;
            }
        }

        // "Green/Cross" caution: calling opposite color requires much stronger hand
        // because you can't rely on partner having the bowers
        if (crossSuits.includes(bestSuit)) {
            bestStrength -= 2; // Penalize green calls — they need to be very strong
        }
    }

    // Thresholds for calling trump in Round 2
    let callThreshold = 7;
    let aloneThreshold = 14;

    if (difficulty === 'casual') {
        callThreshold = 10;
        aloneThreshold = 17;
    } else if (difficulty === 'intermediate') {
        callThreshold = 8;
        aloneThreshold = 15;
    }

    // Score pressure for Intense
    if (difficulty === 'intense') {
        const myTeam = (gameState.currentPlayer === 0 || gameState.currentPlayer === 2) ? 0 : 1;
        const opponentTeam = 1 - myTeam;
        if (gameState.score[myTeam] >= 9) callThreshold -= 2;
        if (gameState.score[opponentTeam] >= 9) callThreshold -= 1;

        // Loner: require both bowers
        const hasRightBower = hand.some(c => c.value === 'J' && c.suit === bestSuit);
        const hasLeftBower = hand.some(c => c.value === 'J' && getEffectiveSuit(c, bestSuit) === bestSuit && c.suit !== bestSuit);
        if (!(hasRightBower && hasLeftBower && bestStrength >= aloneThreshold)) {
            aloneThreshold = 999;
        }
    }

    let shouldCall = bestStrength >= callThreshold || isStickTheDealer;

    // Random factor (very low for Intense)
    const randomness = difficulty === 'casual' ? 0.3 : (difficulty === 'intermediate' ? 0.15 : 0.03);
    if (!isStickTheDealer && Math.random() < randomness) shouldCall = !shouldCall;

    const shouldGoAlone = bestStrength >= aloneThreshold;

    if (shouldCall) {
        if (isStickTheDealer) {
            const message = shouldGoAlone ? 'call_trump_alone_forced' : 'call_trump_forced';
            showAIDecision(gameState.currentPlayer, message, bestSuit);
        } else {
            const message = shouldGoAlone ? 'call_trump_alone' : 'call_trump';
            showAIDecision(gameState.currentPlayer, message, bestSuit);
        }
        setTimeout(() => {
            gameState.isProcessingTurn = false;
            orderUp(bestSuit, shouldGoAlone);
        }, 2500);
    } else {
        showAIDecision(gameState.currentPlayer, 'pass');
        setTimeout(() => {
            gameState.isProcessingTurn = false;
            pass();
        }, 2500);
    }
}

// Show the trump corner icons
function showTrumpArea() {
    const trumpCornerIcons = document.getElementById('trump-corner-icons');
    if (trumpCornerIcons && gameState.trumpSuit) {
        // Set the suit symbol for all corner icons
        const suitSymbol = SUIT_SYMBOLS[gameState.trumpSuit];
        const icons = trumpCornerIcons.querySelectorAll('.trump-icon');
        icons.forEach(icon => {
            icon.textContent = suitSymbol;
            // Add color based on suit
            if (gameState.trumpSuit === 'hearts' || gameState.trumpSuit === 'diamonds') {
                icon.style.color = '#e74c3c'; // Red
            } else {
                icon.style.color = '#2c3e50'; // Black
            }
        });
        trumpCornerIcons.style.display = 'block';
    }
}

// Hide the trump corner icons
function hideTrumpArea() {
    const trumpCornerIcons = document.getElementById('trump-corner-icons');
    if (trumpCornerIcons) {
        trumpCornerIcons.style.display = 'none';
    }
}

// Player orders up the top card
function orderUp(suit, goingAlone = false) {
    gameState.isProcessingTurn = false; // Release turn lock

    // Prevent duplicate calls
    if (gameState.trumpSuit) {
        console.log('Trump already set, ignoring duplicate orderUp call');
        return;
    }

    // Hide the dealer connection line
    hideDealerConnectionLine();

    gameState.trumpSuit = suit;

    // Track who made trump (maker team)
    gameState.makerIndex = gameState.currentPlayer;
    gameState.makerTeam = (gameState.makerIndex === 0 || gameState.makerIndex === 2) ? 0 : 1;
    gameState.makerIsAlone = goingAlone;

    console.log('Trump made by player:', gameState.makerIndex, 'Team:', gameState.makerTeam, 'Alone:', goingAlone);

    // If going alone, show special message
    if (goingAlone) {
        const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];
        messageEl.textContent = `${playerNames[gameState.makerIndex]} is going alone!`;

        // Set partner index based on maker
        const partnerIndex = getPartnerIndex(gameState.makerIndex);
        gameState.partnerSittingOut = partnerIndex;
        console.log('Partner sitting out:', partnerIndex);

        // Hide the partner's hand
        updatePartnerHandVisibility();
    }

    // Show the trump area now that trump is determined
    showTrumpArea();

    if (gameState.biddingRound === 1) {
        // Round 1: Dealer picks up the trump candidate card and must discard
        const topCard = gameState.deck.pop();
        if (gameState.dealer === 0) {
            console.log('Player hand before trump pickup:', gameState.playerHand.length);
            // Mark the trump card for visual distinction
            topCard.isTrumpPickup = true;

            if (gameState.makerIsAlone && gameState.partnerSittingOut === 0) {
                // User is sitting out. Auto-discard their lowest card for them
                gameState.playerHand.push(topCard);

                let cardToDiscard = gameState.playerHand[0];
                let lowestValue = getEuchreCardValue(cardToDiscard, gameState.trumpSuit);
                for (let card of gameState.playerHand) {
                    const cardValue = getEuchreCardValue(card, gameState.trumpSuit);
                    if (cardValue < lowestValue) {
                        cardToDiscard = card;
                        lowestValue = cardValue;
                    }
                }
                const discardIndex = gameState.playerHand.indexOf(cardToDiscard);
                gameState.playerHand.splice(discardIndex, 1);

                console.log('Player hand after auto-discard:', gameState.playerHand.length);
                renderPlayerHand();

                messageEl.textContent = 'You are sitting out this hand. Your partner is going alone!';
                updateTurnIndicators();

                setTimeout(() => {
                    finishDiscardPhase();
                }, 1500);
            } else {
                gameState.playerHand.push(topCard);
                console.log('Player hand after trump pickup:', gameState.playerHand.length);

                // DON'T re-render the hand — existing cards are already positioned correctly.
                // Just append the trump pickup card directly as an offset floating card,
                // leaving the 5-card fan completely untouched.
                const trumpCardIndex = gameState.playerHand.length - 1;
                const trumpEl = createCardElement(topCard, trumpCardIndex, false);
                const baseT = 'rotate(15deg)';
                trumpEl.style.transform = baseT;
                trumpEl.style.setProperty('--fan-rotation', '15deg');
                trumpEl.style.bottom = '-1rem';
                trumpEl.style.right = '-3rem';
                trumpEl.style.left = 'auto';
                trumpEl.style.marginLeft = '0';
                trumpEl.addEventListener('mouseenter', () => {
                    trumpEl.style.transform = `${baseT} translateY(-1.4rem)`;
                });
                trumpEl.addEventListener('mouseleave', () => {
                    trumpEl.style.transform = baseT;
                });
                playerHandEl.appendChild(trumpEl);

                // Player dealer needs to discard
                gameState.gamePhase = 'discarding';
                gameState.currentPlayer = 0;
                messageEl.textContent = 'Your turn. Select a card to discard.';
                updateTurnIndicators();
                showUserTurnDialog('You picked up the trump card. Select a card to discard.');
                enableCardSelectionForDiscard();
            }
        } else {
            // Computer dealer picks up the trump card — animate the full pickup + discard sequence
            // First, immediately move the trump candidate to the trump area and hide it
            moveTrumpCandidateToTrumpArea();
            hideTrumpCandidate();
            animateComputerTrumpPickupAndDiscard(gameState.dealer, topCard, () => {
                // After animation completes, sweep the center deck off screen
                const centerDeck = document.getElementById('center-deck');
                if (centerDeck) centerDeck.classList.add('animate-offscreen');
                // Then start the game
                setTimeout(finishDiscardPhase, 800);
            });
            updateUI();
            return; // Early return — finishDiscardPhase handled by callback
        }
        // Show the original trump candidate in trump area (South dealer path)
        moveTrumpCandidateToTrumpArea();
        hideTrumpCandidate();
    } else {
        // Round 2: No pickup — just name the suit and start playing
        hideTrumpCandidate();
        finishDiscardPhase();
    }

    updateUI();
}

// Animate computer dealer picking up trump card then discarding — called only for AI dealers (1-3)
function animateComputerTrumpPickupAndDiscard(dealerIndex, topCard, onComplete) {
    const centerDeck = document.getElementById('center-deck');
    const handElements = [playerHandEl, westHandEl, northHandEl, eastHandEl];
    const dealerHandEl = handElements[dealerIndex];

    if (!centerDeck || !dealerHandEl) { onComplete(); return; }

    // --- STEP 1: Pick up animation — card-back flies from center deck to dealer hand ---
    const allDeckCards = centerDeck.querySelectorAll('.deck-card');
    const deckCardRect = allDeckCards.length > 0
        ? allDeckCards[allDeckCards.length - 1].getBoundingClientRect()
        : centerDeck.getBoundingClientRect();
    const handRect = dealerHandEl.getBoundingClientRect();

    // First, add the card to state and re-render silently (so hand has 6 mentally)
    gameState.computerHands[dealerIndex - 1].push(topCard);

    // Pick-up clone: card-back starting at deck
    const pickupEl = createCardBackElement();
    pickupEl.style.position = 'fixed';
    pickupEl.style.left = deckCardRect.left + 'px';
    pickupEl.style.top = deckCardRect.top + 'px';
    pickupEl.style.width = deckCardRect.width + 'px';
    pickupEl.style.height = deckCardRect.height + 'px';
    pickupEl.style.zIndex = '2000';
    pickupEl.style.pointerEvents = 'none';
    pickupEl.style.transition = 'none';
    document.body.appendChild(pickupEl);

    // Target: center of dealer hand
    const endX = handRect.left + handRect.width / 2 - deckCardRect.width / 2;
    const endY = handRect.top + handRect.height / 2 - deckCardRect.height / 2;

    // Remove the top deck card so it appears to leave
    if (allDeckCards.length > 0) allDeckCards[allDeckCards.length - 1].remove();

    pickupEl.offsetHeight; // reflow
    pickupEl.style.transition = 'all 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    setTimeout(() => {
        pickupEl.style.left = endX + 'px';
        pickupEl.style.top = endY + 'px';
    }, 50);

    // --- STEP 2: After pickup lands, AI thinks briefly, then discard animation ---
    setTimeout(() => {
        document.body.removeChild(pickupEl);
        // Re-render hand so dealer visually shows 6 cards
        renderComputerHands();

        // Determine which card to discard (same logic as computerDiscard)
        const dealerHand = gameState.computerHands[dealerIndex - 1];
        let cardToDiscard = dealerHand[0];
        let lowestValue = getEuchreCardValue(cardToDiscard, gameState.trumpSuit);
        for (let card of dealerHand) {
            const val = getEuchreCardValue(card, gameState.trumpSuit);
            if (val < lowestValue) { cardToDiscard = card; lowestValue = val; }
        }

        // Short pause to simulate "thinking"
        setTimeout(() => {
            // Get fresh hand rect for discard start
            const freshHandRect = dealerHandEl.getBoundingClientRect();
            const freshDeckRect = centerDeck.getBoundingClientRect();

            // Discard clone: card-back starting at hand, flying to center deck
            const discardEl = createCardBackElement();
            discardEl.style.position = 'fixed';
            discardEl.style.left = (freshHandRect.left + freshHandRect.width / 2 - deckCardRect.width / 2) + 'px';
            discardEl.style.top = (freshHandRect.top + freshHandRect.height / 2 - deckCardRect.height / 2) + 'px';
            discardEl.style.width = deckCardRect.width + 'px';
            discardEl.style.height = deckCardRect.height + 'px';
            discardEl.style.zIndex = '2000';
            discardEl.style.pointerEvents = 'none';
            discardEl.style.transition = 'none';
            document.body.appendChild(discardEl);

            // Target: center deck location
            const discardTargetX = freshDeckRect.left + freshDeckRect.width / 2 - deckCardRect.width / 2;
            const discardTargetY = freshDeckRect.top + freshDeckRect.height / 2 - deckCardRect.height / 2;

            // Actually remove from state now
            const cardIndex = dealerHand.indexOf(cardToDiscard);
            dealerHand.splice(cardIndex, 1);

            discardEl.offsetHeight; // reflow
            discardEl.style.transition = 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            setTimeout(() => {
                discardEl.style.left = discardTargetX + 'px';
                discardEl.style.top = discardTargetY + 'px';
                discardEl.style.opacity = '0.7';
            }, 50);

            // After discard lands: re-render hand (now back to 5), then call onComplete
            setTimeout(() => {
                document.body.removeChild(discardEl);
                renderComputerHands();
                onComplete();
            }, 600);

        }, 700); // AI "thinking" pause
    }, 650); // Pickup flight duration
} // end animateComputerTrumpPickupAndDiscard

// Computer dealer discards a card
function computerDiscard() {
    console.log('computerDiscard called - dealer:', gameState.dealer);
    const dealerHand = gameState.computerHands[gameState.dealer - 1];
    console.log('Dealer hand size:', dealerHand ? dealerHand.length : 'undefined');
    console.log('Dealer hand:', dealerHand);

    if (!dealerHand || dealerHand.length === 0) {
        console.error('Dealer hand is empty or undefined!');
        return;
    }

    const difficulty = gameState.settings.difficulty || 'casual';
    let cardToDiscard = null;

    if (difficulty === 'intense') {
        // Advanced discard strategy for Intense:
        // Priority 1: Create a void by discarding a singleton off-suit (non-trump, non-Ace)
        // Priority 2: Discard the lowest off-suit card from the longest off-suit
        // Priority 3: Never discard trump unless forced
        // Priority 4: Never discard an off-suit Ace unless forced

        const offSuitCards = dealerHand.filter(c => !isCardTrump(c, gameState.trumpSuit));
        const trumpCards = dealerHand.filter(c => isCardTrump(c, gameState.trumpSuit));

        if (offSuitCards.length > 0) {
            // Count off-suit distribution
            const suitCounts = {};
            offSuitCards.forEach(c => {
                const s = getEffectiveSuit(c, gameState.trumpSuit);
                if (!suitCounts[s]) suitCounts[s] = [];
                suitCounts[s].push(c);
            });

            // Priority 1: Find singleton off-suit cards (not Aces) to create a void
            let singletonCandidates = [];
            Object.keys(suitCounts).forEach(s => {
                if (suitCounts[s].length === 1) {
                    const card = suitCounts[s][0];
                    if (card.value !== 'A') {
                        singletonCandidates.push(card);
                    }
                }
            });

            if (singletonCandidates.length > 0) {
                // Discard the lowest singleton to create a void
                cardToDiscard = singletonCandidates.reduce((lowest, c) =>
                    getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                );
            }

            if (!cardToDiscard) {
                // Priority 2: Discard lowest off-suit non-Ace card
                const nonAceOffSuit = offSuitCards.filter(c => c.value !== 'A');
                if (nonAceOffSuit.length > 0) {
                    cardToDiscard = nonAceOffSuit.reduce((lowest, c) =>
                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                    );
                }
            }

            if (!cardToDiscard) {
                // Priority 3: Must discard an Ace (all off-suit cards are Aces) — discard the one from the longest suit
                cardToDiscard = offSuitCards.reduce((best, c) => {
                    const bestSuitLen = suitCounts[getEffectiveSuit(best, gameState.trumpSuit)]?.length || 0;
                    const cSuitLen = suitCounts[getEffectiveSuit(c, gameState.trumpSuit)]?.length || 0;
                    return cSuitLen > bestSuitLen ? c : best;
                });
            }
        }

        if (!cardToDiscard) {
            // All trump — discard lowest trump (9 of trump)
            cardToDiscard = trumpCards.reduce((lowest, c) =>
                getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
            );
        }
    } else {
        // Casual/Intermediate: simple lowest value discard
        cardToDiscard = dealerHand[0];
        let lowestValue = getEuchreCardValue(cardToDiscard, gameState.trumpSuit);

        for (let card of dealerHand) {
            const cardValue = getEuchreCardValue(card, gameState.trumpSuit);
            if (cardValue < lowestValue) {
                cardToDiscard = card;
                lowestValue = cardValue;
            }
        }
    }

    // Remove card from dealer's hand
    const cardIndex = dealerHand.indexOf(cardToDiscard);
    dealerHand.splice(cardIndex, 1);

    // Card is discarded (no visual discard pile)

    // Update display
    renderComputerHands();

    // Start the game
    finishDiscardPhase();
}

// Helper function to get card value for comparison
function getCardValue(card) {
    const values = { '9': 1, '10': 2, 'J': 3, 'Q': 4, 'K': 5, 'A': 6 };
    return values[card.value] || 0;
}

// Enable card selection for discarding
function enableCardSelectionForDiscard() {
    const playerCards = playerHandEl.querySelectorAll('.card');
    playerCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', handleDiscardClick);
    });
}

// Handle discard card click
function handleDiscardClick(event) {
    if (gameState.gamePhase !== 'discarding') return;

    const cardEl = event.currentTarget;
    const cardIndex = parseInt(cardEl.dataset.index);
    const card = gameState.playerHand[cardIndex];

    if (!card) return;

    // Remove trump pickup flag if discarding the trump card
    if (card.isTrumpPickup) {
        delete card.isTrumpPickup;
    }

    // Remove card from player's hand
    gameState.playerHand.splice(cardIndex, 1);

    // Hide user turn dialog
    hideUserTurnDialog();

    // Card is discarded (no visual discard pile)

    // Update hand display
    renderPlayerHand();

    // Disable card selection
    disableCardSelectionForDiscard();

    // Start the game
    setTimeout(finishDiscardPhase, 300); // Reduced delay since no animation
}

// Disable card selection for discarding
function disableCardSelectionForDiscard() {
    const playerCards = playerHandEl.querySelectorAll('.card');
    playerCards.forEach(card => {
        card.style.cursor = 'default';
        card.removeEventListener('click', handleDiscardClick);
    });
}

// Discard pile animation removed - cards just disappear when discarded

// Discard pile function removed - cards just disappear when discarded

// Finish discard phase and start playing
function finishDiscardPhase() {
    gameState.gamePhase = 'playing';

    // Clear trump pickup flags from remaining cards
    gameState.playerHand.forEach(card => {
        if (card.isTrumpPickup) {
            delete card.isTrumpPickup;
        }
    });

    // Re-render hand to remove trump pickup styling
    renderPlayerHand();

    // With the round cleanly starting, elegantly dismiss the remaining kitty deck off the table 
    const centerDeck = document.getElementById('center-deck');
    if (centerDeck) {
        centerDeck.classList.add('animate-offscreen');
    }

    // Set the starting player for the first trick (player to the left of dealer, clockwise)
    gameState.currentPlayer = (gameState.dealer + 1) % 4;

    // Show message about trump and going alone if applicable
    let message = `Trump is ${gameState.trumpSuit}.`;
    if (gameState.makerIsAlone) {
        const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];
        const partnerNames = ['Your Teammate', 'Fucker 2', 'You', 'Fucker 1'];
        message += ` ${playerNames[gameState.makerIndex]} is going alone! ${partnerNames[gameState.makerIndex]} sits out.`;
    }
    message += ' Starting the game...';
    messageEl.textContent = message;

    // Start the first trick
    setTimeout(startTrick, 2000); // Increased delay to read going alone message
}

// Player passes
function pass() {
    gameState.isProcessingTurn = false; // Release turn lock
    const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];
    console.log(playerNames[gameState.currentPlayer] + ' passes');

    // Check if this is an illegal pass (Stick the Dealer)
    if (gameState.settings.stickTheDealer && gameState.biddingRound === 2 &&
        gameState.currentPlayer === gameState.dealer &&
        gameState.passedPlayers.length === 3) {
        console.error('Dealer cannot pass when stuck! Must name trump.');
        messageEl.textContent = 'You cannot pass - you must name trump! (Stick the Dealer)';
        // Force the player to choose
        if (gameState.currentPlayer === 0) {
            showUserTurnDialog('You must name trump:', 'suit_selection_forced');
        } else {
            // AI should never get here, but handle it anyway
            computerCallTrump();
        }
        return;
    }

    gameState.passedPlayers.push(gameState.currentPlayer);

    // Move to next player clockwise: 0(You) -> 1(Fucker 1) -> 2(Teammate) -> 3(Fucker 2)
    const nextPlayerClockwise = [1, 2, 3, 0]; // Next player for each current player index
    const previousPlayer = gameState.currentPlayer;
    gameState.currentPlayer = nextPlayerClockwise[gameState.currentPlayer];
    console.log('Turn progression:', playerNames[previousPlayer], '→', playerNames[gameState.currentPlayer]);

    // Check if we've gone through all players in this round
    if (gameState.passedPlayers.length === 4) {
        if (gameState.biddingRound === 1) {
            // All passed on ordering up, start second round (calling trump)
            gameState.biddingRound = 2;
            gameState.passedPlayers = [];
            // Second round also starts with player to left of dealer (clockwise)
            gameState.currentPlayer = (gameState.dealer + 1) % 4;
            messageEl.textContent = 'All passed. Now players can call trump suit...';
            setTimeout(startBidding, 1800); // Slowed from 1500 to 1800
        } else {
            if (gameState.settings.stickTheDealer) {
                // This shouldn't happen with Stick the Dealer rule
                console.error('All players passed in round 2 - this should not happen with Stick the Dealer!');
                // Fallback: force dealer to pick
                gameState.currentPlayer = gameState.dealer;
                gameState.passedPlayers.pop(); // Remove dealer from passed list
                messageEl.textContent = 'Dealer must name trump! (Stick the Dealer)';
                setTimeout(startBidding, 1800);
            } else {
                // Hand is tossed, move to next dealer
                gameState.dealer = (gameState.dealer + 1) % 4;
                messageEl.textContent = 'Everyone passed. Dealing new hand...';
                updateDealerBadges();
                setTimeout(initGame, 1800);
            }
        }
        return;
    }

    // Continue bidding with next player
    console.log('Continuing bidding after pass...');
    setTimeout(startBidding, 1200); // Slowed from 1000 to 1200
}

// Legacy function - removed since we now use contextual dialog buttons


// Start a new trick
function startTrick() {
    gameState.currentTrick = [];
    gameState.leadSuit = null;
    gameState.cardsPlayed = 0;
    gameState.isProcessingTurn = false;
    gameState.isProcessingTrick = false; // Reset trick guard for new trick

    // Switch to tally mode for active play
    showTrickTallyMode();

    // Clear only trick cards (preserve center-deck)
    $(trickCardsEl).find('.trick-card').fadeOut(300, function () {
        $(this).remove();
    });

    // Check if current player is sitting out and skip them
    if (gameState.makerIsAlone && gameState.currentPlayer === gameState.partnerSittingOut) {
        console.log('Player', gameState.currentPlayer, 'is sitting out - skipping turn');
        const nextPlayerClockwise = [1, 2, 3, 0];
        gameState.currentPlayer = nextPlayerClockwise[gameState.currentPlayer];
        // Don't increment cardsPlayed - no card was actually played
    }

    // Update turn indicators
    updateTurnIndicators();

    // Start play after a brief delay
    setTimeout(() => {
        updateTurnIndicators(); // sync indicator right before prompting
        if (gameState.currentPlayer === 0) {
            enableCardSelection();
            messageEl.textContent = 'Your turn. Select a card to play.';
            // Show prominent user turn dialog
            showUserTurnDialog('Select a card to play');
        } else {
            computerPlayCard();
        }
    }, 650);
}

// Computer plays a card
function computerPlayCard() {
    // GUARD: Prevent overlapping AI turns
    if (gameState.isProcessingTurn) {
        console.log('AI tried to play while turn is already processing - skipping');
        return;
    }

    // GUARD: If it's the player's turn, don't let AI play
    if (gameState.currentPlayer === 0) {
        console.log('AI tried to play on player turn - skipping');
        return;
    }

    gameState.isProcessingTurn = true;
    gameState.lastStateChange = Date.now();

    try {
        // Check if this player is sitting out (partner going alone)
        if (gameState.makerIsAlone && gameState.currentPlayer === gameState.partnerSittingOut) {
            console.log('Player', gameState.currentPlayer, 'is sitting out (partner going alone)');
            const nextPlayerClockwise = [1, 2, 3, 0];
            gameState.currentPlayer = nextPlayerClockwise[gameState.currentPlayer];

            gameState.isProcessingTurn = false; // Reset lock for next person

            if (gameState.cardsPlayed === 4 || (gameState.makerIsAlone && gameState.cardsPlayed === 3)) {
                setTimeout(determineTrickWinner, 1400);
            } else {
                const isLastTrickAutoPlay = (gameState.tricksPlayed === 4 && gameState.cardsPlayed > 0);
                const skipDelay = isLastTrickAutoPlay ? 300 : 750;

                setTimeout(() => {
                    if (gameState.currentPlayer === 0) {
                        if (isLastTrickAutoPlay) {
                            messageEl.textContent = 'Auto-playing your last card...';
                            const lastCard = gameState.playerHand[0];
                            if (lastCard) {
                                playCard(lastCard, 0);
                            }
                        } else {
                            enableCardSelection();
                            messageEl.textContent = 'Your turn. Select a card to play.';
                            showUserTurnDialog('Select a card to play');
                        }
                    } else {
                        computerPlayCard();
                    }
                }, skipDelay);
            }
            return;
        }

        // Card play AI with comprehensive strategy
        const hand = gameState.computerHands[gameState.currentPlayer - 1];
        let validCards = hand;

        // If not leading and has a card of the lead suit, must follow suit
        if (gameState.leadSuit) {
            const cardsInSuit = hand.filter(card =>
                getEffectiveSuit(card, gameState.trumpSuit) === gameState.leadSuit
            );

            if (cardsInSuit.length > 0) {
                validCards = cardsInSuit;
            }
        }

        // Select the best card based on difficulty and heuristics
        const difficulty = gameState.settings.difficulty || 'casual';
        let cardToPlay;

        if (validCards.length === 1) {
            cardToPlay = validCards[0];
        } else if (difficulty === 'casual') {
            // Casual: Mostly random valid card, slight preference for high cards
            cardToPlay = validCards.sort((a, b) =>
                getEuchreCardValue(b, gameState.trumpSuit) - getEuchreCardValue(a, gameState.trumpSuit)
            )[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * validCards.length)];
        } else if (difficulty === 'intense') {
            // ═══════════════════════════════════════════════════════════════
            // INTENSE AI — Advanced Euchre Strategy
            // ═══════════════════════════════════════════════════════════════
            const isMaker = gameState.makerIndex === gameState.currentPlayer;
            const isPartnerOfMaker = getPartnerIndex(gameState.makerIndex) === gameState.currentPlayer;
            const isMakerTeam = isMaker || isPartnerOfMaker;
            const isDefending = !isMakerTeam;
            const partnerIndex = getPartnerIndex(gameState.currentPlayer);

            // Trump counting: how many opponent trump cards are still out?
            const totalTrumpInDeck = 7; // Right bower, Left bower, A, K, Q, 10, 9
            const trumpPlayedCount = gameState.trumpPlayed.length;
            const myTrumpCount = hand.filter(c => isCardTrump(c, gameState.trumpSuit)).length;
            const opponentTrumpRemaining = totalTrumpInDeck - trumpPlayedCount - myTrumpCount;
            // Estimate partner's trump (subtract what we know partner doesn't have)
            const allTrumpAccountedFor = trumpPlayedCount + myTrumpCount;

            // Suit distribution of current hand
            const mySuitCounts = {};
            hand.forEach(c => {
                const s = getEffectiveSuit(c, gameState.trumpSuit);
                mySuitCounts[s] = (mySuitCounts[s] || 0) + 1;
            });

            if (!gameState.leadSuit) {
                // ═══════════════════════════════════════
                // WE ARE LEADING
                // ═══════════════════════════════════════
                const trumpCards = validCards.filter(c => isCardTrump(c, gameState.trumpSuit));
                const offSuitCards = validCards.filter(c => !isCardTrump(c, gameState.trumpSuit));

                if (isMaker) {
                    // MAKER LEADING: Lead trump to bleed opponents until their trump is exhausted
                    if (trumpCards.length > 0 && opponentTrumpRemaining > 0) {
                        // Lead highest trump to pull out opponent trump
                        cardToPlay = trumpCards.reduce((highest, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                        );
                    } else if (opponentTrumpRemaining === 0 && offSuitCards.length > 0) {
                        // All opponent trump is gone! Lead off-suit winners (Aces, then Kings)
                        const offSuitAces = offSuitCards.filter(c => c.value === 'A');
                        if (offSuitAces.length > 0) {
                            cardToPlay = offSuitAces[0];
                        } else {
                            // Lead highest remaining off-suit
                            cardToPlay = offSuitCards.reduce((highest, c) =>
                                getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                            );
                        }
                    }
                } else if (isPartnerOfMaker) {
                    // PARTNER OF MAKER: Lead trump to help partner bleed opponents
                    if (trumpCards.length > 0 && opponentTrumpRemaining > 0 && gameState.tricksPlayed < 3) {
                        // Lead trump to support maker — highest to pull opponent trump
                        cardToPlay = trumpCards.reduce((highest, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                        );
                    } else {
                        // Lead off-suit Aces to set up trick winners
                        const offSuitAces = offSuitCards.filter(c => c.value === 'A');
                        if (offSuitAces.length > 0) {
                            cardToPlay = offSuitAces[0];
                        }
                    }
                } else {
                    // DEFENDER LEADING: Do NOT lead trump on defense
                    // Lead off-suit Aces to force maker to waste trump
                    if (offSuitCards.length > 0) {
                        const offSuitAces = offSuitCards.filter(c => c.value === 'A');
                        if (offSuitAces.length > 0) {
                            cardToPlay = offSuitAces[0];
                        } else {
                            // Lead through known voids: if an opponent is void in a suit,
                            // lead that suit to let partner potentially win
                            const opponents = [1, 3].includes(gameState.currentPlayer) ? [0, 2] : [1, 3];
                            for (const opp of opponents) {
                                for (const voidSuit of (gameState.suitsVoidByPlayer[opp] || [])) {
                                    if (voidSuit !== gameState.trumpSuit) {
                                        const cardsInVoidSuit = offSuitCards.filter(c => getEffectiveSuit(c, gameState.trumpSuit) === voidSuit);
                                        if (cardsInVoidSuit.length > 0) {
                                            // Lead high in this suit — opponent can't follow, partner might take it
                                            cardToPlay = cardsInVoidSuit.reduce((highest, c) =>
                                                getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                                            );
                                            break;
                                        }
                                    }
                                }
                                if (cardToPlay) break;
                            }

                            if (!cardToPlay) {
                                // Lead lowest off-suit to probe — save high cards
                                cardToPlay = offSuitCards.reduce((lowest, c) =>
                                    getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                                );
                            }
                        }
                    }
                    // Defenders: only lead trump as last resort (no off-suit left)
                }

                // Fallback for leading: if nothing was selected yet
                if (!cardToPlay) {
                    // Try off-suit Aces first
                    const offSuitAces = validCards.filter(c => !isCardTrump(c, gameState.trumpSuit) && c.value === 'A');
                    if (offSuitAces.length > 0) {
                        cardToPlay = offSuitAces[0];
                    } else {
                        // Lead highest card available
                        cardToPlay = validCards.reduce((highest, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                        );
                    }
                }
            } else {
                // ═══════════════════════════════════════
                // WE ARE FOLLOWING
                // ═══════════════════════════════════════
                let currentWinningCard = gameState.currentTrick[0];
                for (let i = 1; i < gameState.currentTrick.length; i++) {
                    if (isCardHigher(gameState.currentTrick[i].card, currentWinningCard.card, gameState.trumpSuit, gameState.leadSuit)) {
                        currentWinningCard = gameState.currentTrick[i];
                    }
                }

                const partnerIsWinning = currentWinningCard.player === partnerIndex;
                const winningCards = validCards.filter(c => isCardHigher(c, currentWinningCard.card, gameState.trumpSuit, gameState.leadSuit));
                const isVoidInLeadSuit = !hand.some(c => getEffectiveSuit(c, gameState.trumpSuit) === gameState.leadSuit);
                const trickPosition = gameState.currentTrick.length; // 1=2nd seat, 2=3rd seat, 3=4th seat (last)

                if (partnerIsWinning) {
                    // Partner is winning — throw away trash
                    // Specifically throw lowest NON-trump card if possible to preserve trump
                    const nonTrumpValid = validCards.filter(c => !isCardTrump(c, gameState.trumpSuit));
                    if (nonTrumpValid.length > 0) {
                        cardToPlay = nonTrumpValid.reduce((lowest, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                        );
                    } else {
                        // All valid cards are trump — play lowest trump
                        cardToPlay = validCards.reduce((lowest, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                        );
                    }
                } else if (isVoidInLeadSuit) {
                    // We're VOID in lead suit — decide whether to trump in or slough
                    const trumpInHand = validCards.filter(c => isCardTrump(c, gameState.trumpSuit));
                    const nonTrumpInHand = validCards.filter(c => !isCardTrump(c, gameState.trumpSuit));

                    if (trumpInHand.length > 0) {
                        // Can we win by trumping in?
                        const winningTrump = trumpInHand.filter(c => isCardHigher(c, currentWinningCard.card, gameState.trumpSuit, gameState.leadSuit));

                        if (winningTrump.length > 0) {
                            if (isDefending && trumpInHand.length === 1 && trickPosition < 3) {
                                // Defender with only 1 trump, not last to play: save it for a more critical trick
                                // Slough a low off-suit card instead
                                if (nonTrumpInHand.length > 0) {
                                    cardToPlay = nonTrumpInHand.reduce((lowest, c) =>
                                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                                    );
                                } else {
                                    // Only have trump — play lowest winning trump
                                    cardToPlay = winningTrump.reduce((lowest, c) =>
                                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                                    );
                                }
                            } else {
                                // Trump in with lowest winning trump ("don't send a boy to do a man's job")
                                // But use high enough trump to avoid being over-trumped
                                if (trickPosition < 3 && opponentTrumpRemaining > 0) {
                                    // Not last to play — someone might over-trump. Use a mid/high winning trump
                                    cardToPlay = winningTrump.reduce((highest, c) =>
                                        getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                                    );
                                } else {
                                    // Last to play or no opponent trump left — lowest winning trump is fine
                                    cardToPlay = winningTrump.reduce((lowest, c) =>
                                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                                    );
                                }
                            }
                        } else {
                            // Can't win even by trumping — slough a low card
                            if (nonTrumpInHand.length > 0) {
                                cardToPlay = nonTrumpInHand.reduce((lowest, c) =>
                                    getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                                );
                            } else {
                                cardToPlay = validCards.reduce((lowest, c) =>
                                    getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                                );
                            }
                        }
                    } else {
                        // No trump, void in lead — just slough lowest
                        cardToPlay = validCards.reduce((lowest, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                        );
                    }
                } else if (winningCards.length > 0) {
                    // We CAN win by following suit
                    if (trickPosition === 3) {
                        // 4th seat (last to play): play LOWEST winning card to save resources
                        cardToPlay = winningCards.reduce((lowestWinning, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowestWinning, gameState.trumpSuit) ? c : lowestWinning
                        );
                    } else {
                        // Not last to play: play HIGHEST winning card to withstand potential over-play
                        cardToPlay = winningCards.reduce((highestWinning, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highestWinning, gameState.trumpSuit) ? c : highestWinning
                        );
                    }
                } else {
                    // We CAN'T win. Play the lowest card to minimize loss.
                    cardToPlay = validCards.reduce((lowest, c) =>
                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                    );
                }
            }
        } else {
            // Intermediate strategies (existing logic)
            if (!gameState.leadSuit) {
                // WE ARE LEADING
                const isMaker = gameState.makerIndex === gameState.currentPlayer;

                if (isMaker) {
                    // Lead highest trump early to bleed opponents
                    const trumpCards = validCards.filter(c => isCardTrump(c, gameState.trumpSuit));
                    if (trumpCards.length > 0 && gameState.tricksPlayed < 2) {
                        cardToPlay = trumpCards.reduce((highest, c) =>
                            getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                        );
                    }
                }

                if (!cardToPlay) {
                    // Default Lead Strategy: Play highest off-suit Ace/King, or lowest card of a singleton suit
                    const offSuitAces = validCards.filter(c => !isCardTrump(c, gameState.trumpSuit) && c.value === 'A');
                    if (offSuitAces.length > 0) {
                        cardToPlay = offSuitAces[0];
                    }
                }

                if (!cardToPlay) {
                    // Fallback: highest card
                    cardToPlay = validCards.reduce((highest, c) =>
                        getEuchreCardValue(c, gameState.trumpSuit) > getEuchreCardValue(highest, gameState.trumpSuit) ? c : highest
                    );
                }
            } else {
                // WE ARE FOLLOWING
                let currentWinningCard = gameState.currentTrick[0];
                for (let i = 1; i < gameState.currentTrick.length; i++) {
                    if (isCardHigher(gameState.currentTrick[i].card, currentWinningCard.card, gameState.trumpSuit, gameState.leadSuit)) {
                        currentWinningCard = gameState.currentTrick[i];
                    }
                }

                const partnerIndex = getPartnerIndex(gameState.currentPlayer);
                const partnerIsWinning = currentWinningCard.player === partnerIndex;
                const winningCards = validCards.filter(c => isCardHigher(c, currentWinningCard.card, gameState.trumpSuit, gameState.leadSuit));

                if (partnerIsWinning) {
                    // Partner has it! Throw away trash
                    cardToPlay = validCards.reduce((lowest, c) =>
                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                    );
                } else if (winningCards.length > 0) {
                    // We can win. Play the lowest card that wins.
                    cardToPlay = winningCards.reduce((lowestWinning, c) =>
                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowestWinning, gameState.trumpSuit) ? c : lowestWinning
                    );
                } else {
                    // We can't win. Play the lowest card.
                    cardToPlay = validCards.reduce((lowest, c) =>
                        getEuchreCardValue(c, gameState.trumpSuit) < getEuchreCardValue(lowest, gameState.trumpSuit) ? c : lowest
                    );
                }
            }
        }

        if (!cardToPlay) {
            console.error('AI failed to select a card to play for player', gameState.currentPlayer, 'Valid cards:', validCards);
            cardToPlay = validCards[0]; // Fallback to first valid card
        }

        const card = cardToPlay;

        const isLastTrickAutoPlay = (gameState.tricksPlayed === 4 && gameState.cardsPlayed > 0);
        const playDelay = isLastTrickAutoPlay ? 300 : 1400;

        // Play the card after a short delay
        setTimeout(() => {
            gameState.isProcessingTurn = false; // Unlock for actual play execution
            playCard(card, gameState.currentPlayer);
        }, playDelay);
    } catch (error) {
        console.error('Error in computerPlayCard:', error);
        gameState.isProcessingTurn = false;
    }
}

// Play a card with smooth animation from hand to center
function playCard(card, playerIndex) {
    // Add the card to the current trick
    gameState.currentTrick.push({
        card,
        player: playerIndex
    });

    // Track trump cards played (for Intense AI trump counting)
    if (gameState.trumpSuit && isCardTrump(card, gameState.trumpSuit)) {
        gameState.trumpPlayed.push(card);
    }

    // Track void information: if player didn't follow suit, they are void in the lead suit
    if (gameState.leadSuit && gameState.trumpSuit) {
        const cardEffectiveSuit = getEffectiveSuit(card, gameState.trumpSuit);
        if (cardEffectiveSuit !== gameState.leadSuit && !gameState.suitsVoidByPlayer[playerIndex].includes(gameState.leadSuit)) {
            gameState.suitsVoidByPlayer[playerIndex].push(gameState.leadSuit);
        }
    }

    let cardEl;

    // Get the card element and animate it to center
    if (playerIndex === 0) {
        const cardIndex = gameState.playerHand.findIndex(c =>
            c.suit === card.suit && c.value === card.value
        );
        if (cardIndex !== -1) {
            cardEl = $(playerHandEl).find(`[data-index="${cardIndex}"]`)[0];
            gameState.playerHand.splice(cardIndex, 1);
        }
    } else {
        const hand = gameState.computerHands[playerIndex - 1];
        const cardIndex = hand.findIndex(c =>
            c.suit === card.suit && c.value === card.value
        );
        if (cardIndex !== -1) {
            const handEl = handElements[playerIndex];
            cardEl = $(handEl).find('.card').eq(cardIndex)[0];
            hand.splice(cardIndex, 1);
        }
    }

    if (cardEl) {
        animateCardToCenter(cardEl, card, playerIndex);
    }

    // If this is the first card, set the lead suit (using effective suit for trump logic)
    if (gameState.leadSuit === null) {
        gameState.leadSuit = getEffectiveSuit(card, gameState.trumpSuit);
    }

    // Move to the next player clockwise: 0(You) -> 1(Fucker 1) -> 2(Teammate) -> 3(Fucker 2)
    const nextPlayerClockwise = [1, 2, 3, 0]; // Next player for each current player index
    gameState.currentPlayer = nextPlayerClockwise[gameState.currentPlayer];
    gameState.cardsPlayed++;

    // Skip the sitting out partner if going alone
    if (gameState.makerIsAlone && gameState.currentPlayer === gameState.partnerSittingOut) {
        console.log('Skipping sitting out partner:', gameState.currentPlayer);
        gameState.currentPlayer = nextPlayerClockwise[gameState.currentPlayer];
        // Don't increment cardsPlayed - no card was actually played
    }

    // Update score only immediately; defer turn indicator until we know who plays
    document.getElementById('team1-score').textContent = gameState.score[0];
    document.getElementById('team2-score').textContent = gameState.score[1];
    updateDealerBadges();

    // If all players have played (or 3 if someone is going alone), determine the winner
    // Added safety: if we somehow have 4+ cards, definitely determine winner
    if (gameState.cardsPlayed >= 4 || (gameState.makerIsAlone && gameState.cardsPlayed >= 3)) {
        setTimeout(determineTrickWinner, 1400);
    } else {
        const isLastTrickAutoPlay = (gameState.tricksPlayed === 4 && gameState.cardsPlayed > 0);
        const nextDelay = isLastTrickAutoPlay ? 300 : 750;

        setTimeout(() => {
            updateTurnIndicators(); // sync indicator right before prompting
            if (gameState.currentPlayer === 0) {
                if (isLastTrickAutoPlay) {
                    messageEl.textContent = 'Auto-playing your last card...';
                    const lastCard = gameState.playerHand[0];
                    if (lastCard) {
                        playCard(lastCard, 0);
                    }
                } else {
                    enableCardSelection();
                    messageEl.textContent = 'Your turn. Select a card to play.';
                    // Show prominent user turn dialog
                    showUserTurnDialog('Select a card to play');
                }
            } else {
                computerPlayCard();
            }
        }, nextDelay); // Slowed from 800 to 960
    }
}

// Compare two cards to see if card1 beats card2 in Euchre
function isCardHigher(card1, card2, trumpSuit, leadSuit) {
    const card1IsTrump = isCardTrump(card1, trumpSuit);
    const card2IsTrump = isCardTrump(card2, trumpSuit);

    // Trump beats non-trump
    if (card1IsTrump && !card2IsTrump) return true;
    if (!card1IsTrump && card2IsTrump) return false;

    // Both trump — compare trump values (bowers > A > K > Q > 10 > 9)
    if (card1IsTrump && card2IsTrump) {
        return getEuchreCardValue(card1, trumpSuit) > getEuchreCardValue(card2, trumpSuit);
    }

    // Neither is trump — lead suit beats off-suit
    const card1EffSuit = getEffectiveSuit(card1, trumpSuit);
    const card2EffSuit = getEffectiveSuit(card2, trumpSuit);
    const card1IsLead = card1EffSuit === leadSuit;
    const card2IsLead = card2EffSuit === leadSuit;

    if (card1IsLead && !card2IsLead) return true;
    if (!card1IsLead && card2IsLead) return false;

    // Same category — higher value wins
    return getEuchreCardValue(card1, trumpSuit) > getEuchreCardValue(card2, trumpSuit);
}

// Get the Euchre value of a card (higher = better)
function getEuchreCardValue(card, trumpSuit) {
    if (!card) return 0;

    // Right bower (Jack of trump suit) - highest
    if (card.value === 'J' && card.suit === trumpSuit) {
        return 100;
    }

    // Left bower (Jack of same color as trump) - second highest
    const trumpColor = (trumpSuit === 'hearts' || trumpSuit === 'diamonds') ? 'red' : 'black';
    const cardColor = (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : 'black';
    if (card.value === 'J' && cardColor === trumpColor && card.suit !== trumpSuit) {
        return 99;
    }

    // Other trump cards
    if (card.suit === trumpSuit) {
        const trumpValues = { 'A': 98, 'K': 97, 'Q': 96, '10': 95, '9': 94 };
        return trumpValues[card.value] || 0;
    }

    // Non-trump cards
    const regularValues = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9 };
    return regularValues[card.value] || 0;
}

// Check if a card is trump (including bowers)
function isCardTrump(card, trumpSuit) {
    if (!card || !trumpSuit) return false;

    // Right bower
    if (card.value === 'J' && card.suit === trumpSuit) {
        return true;
    }

    // Left bower
    const trumpColor = (trumpSuit === 'hearts' || trumpSuit === 'diamonds') ? 'red' : 'black';
    const cardColor = (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : 'black';
    if (card.value === 'J' && cardColor === trumpColor && card.suit !== trumpSuit) {
        return true;
    }

    // Regular trump
    return card.suit === trumpSuit;
}

// Determine the winner of the current trick
function determineTrickWinner() {
    // GUARD: prevent double-fire (can happen with overlapping timeouts)
    if (gameState.isProcessingTrick) {
        console.log('determineTrickWinner called while already processing - skipping');
        return;
    }
    gameState.isProcessingTrick = true;

    const expectedCards = gameState.makerIsAlone ? 3 : 4;
    if (gameState.currentTrick.length !== expectedCards) {
        console.warn(`Trick card count mismatch - expected ${expectedCards}, got ${gameState.currentTrick.length}. Attempting to recover.`);
        if (gameState.currentTrick.length === 0) {
            console.error('No cards in trick! Cannot determine winner.');
            gameState.isProcessingTrick = false;
            return;
        }
    }

    let winnerIndex = 0;
    let winningCard = gameState.currentTrick[0];

    // Evaluate each card in the trick
    for (let i = 1; i < gameState.currentTrick.length; i++) {
        const currentCard = gameState.currentTrick[i];

        if (isCardHigher(currentCard.card, winningCard.card, gameState.trumpSuit, gameState.leadSuit)) {
            winnerIndex = i;
            winningCard = currentCard;
        }
    }

    // The winner index corresponds to the player who played the winning card
    const actualWinnerIndex = winningCard.player;
    gameState.trickWinner = actualWinnerIndex;
    gameState.currentPlayer = actualWinnerIndex;

    // Track tricks won this hand (not game score yet)
    const winningTeam = (actualWinnerIndex === 0 || actualWinnerIndex === 2) ? 0 : 1;
    if (winningTeam === 0) {
        gameState.tricksThisHand.team0++;
    } else {
        gameState.tricksThisHand.team1++;
    }
    gameState.tricksPlayed++;

    console.log(`Trick ${gameState.tricksPlayed} won by team ${winningTeam}`);
    console.log('Tricks this hand:', gameState.tricksThisHand);

    // Update tally marks for the winner
    updateTrickTally(actualWinnerIndex);

    // Update in-header trick tally display
    updateTrickTallyDisplay();

    // Update UI
    updateUI();
    const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];
    // Don't overwrite the tally display — update message but keep tally visible
    if (actualWinnerIndex === 0) {
        messageEl.textContent = 'You win the trick!';
    } else {
        messageEl.textContent = `${playerNames[actualWinnerIndex]} wins the trick!`;
    }

    // Animate trick cards to winner
    // Use shorter delay when player south wins so they can play sooner
    const isPlayerTurn = actualWinnerIndex === 0;
    const animDelay = isPlayerTurn ? 700 : 1200;
    const nextDelay = isPlayerTurn ? 2600 : 4800;

    setTimeout(() => {
        animateTrickToWinner(actualWinnerIndex);
    }, animDelay);

    // Check if hand is complete (5 tricks played)
    if (gameState.tricksPlayed >= 5) {
        setTimeout(endHand, nextDelay);
    } else {
        // Start the next trick — reset guard inside startTrick
        setTimeout(startTrick, nextDelay);
    }

    // Release the trick guard now that all work is scheduled.
    // startTrick will also reset it, but releasing here prevents blocking
    // the next trick's determineTrickWinner if startTrick is delayed.
    gameState.isProcessingTrick = false;
}

// Animate trick cards to the winner's area
function animateTrickToWinner(winnerIndex) {
    const trickCards = document.querySelectorAll('.trick-card');
    const tricksContainers = ['south-tricks', 'west-tricks', 'north-tricks', 'east-tricks'];
    const winnerTricksContainer = document.getElementById(tricksContainers[winnerIndex]);

    if (!winnerTricksContainer) return;

    // Get target position
    const containerRect = winnerTricksContainer.getBoundingClientRect();
    const targetX = containerRect.left + containerRect.width / 2;
    const targetY = containerRect.top + containerRect.height / 2;

    trickCards.forEach((card, index) => {
        // Clone the card for animation
        const animatingCard = card.cloneNode(true);
        animatingCard.style.position = 'fixed';
        animatingCard.style.margin = '0';
        animatingCard.style.left = card.getBoundingClientRect().left + 'px';
        animatingCard.style.top = card.getBoundingClientRect().top + 'px';
        animatingCard.style.zIndex = '2000';
        animatingCard.style.transition = 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        animatingCard.style.pointerEvents = 'none';

        // Hide the original card immediately so only the clone is visible
        card.style.opacity = '0';

        document.body.appendChild(animatingCard);

        // Animate to winner's trick area
        setTimeout(() => {
            animatingCard.style.left = (targetX - card.getBoundingClientRect().width / 2) + 'px'; // Center it properly
            animatingCard.style.top = (targetY - card.getBoundingClientRect().height / 2) + 'px';
            animatingCard.style.transform = 'scale(0.4)'; // Make it smaller
            animatingCard.style.opacity = '0.8';
        }, index * 100);

        // After animation, just remove the card (no visual pile)
        setTimeout(() => {
            document.body.removeChild(animatingCard);
            // Cards disappear after animation - no visual trick pile needed
            // since we're tracking tricks in gameState.tricksThisHand
        }, 800 + (index * 100));
    });

    // Clear only trick cards after animation (preserve center-deck)
    setTimeout(() => {
        $(trickCardsEl).find('.trick-card').remove();
    }, 1200);
}

// Clear all trick piles at start of new game
function clearAllTrickPiles() {
    const tricksContainers = ['south-tricks', 'west-tricks', 'north-tricks', 'east-tricks'];
    tricksContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }
    });
}

// End the hand and calculate proper Euchre scoring
function endHand() {
    gameState.gamePhase = 'hand_complete';

    const makerTricks = gameState.makerTeam === 0 ? gameState.tricksThisHand.team0 : gameState.tricksThisHand.team1;
    const defenderTricks = gameState.makerTeam === 0 ? gameState.tricksThisHand.team1 : gameState.tricksThisHand.team0;

    let pointsAwarded = 0;
    let scoringTeam = null;
    let scoringMessage = '';

    const teamNames = ['You and Your Teammate', 'Fucker 2 and Fucker 1'];
    const makerTeamName = teamNames[gameState.makerTeam];
    const defenderTeamName = teamNames[1 - gameState.makerTeam];

    // Euchre scoring rules
    if (makerTricks >= 3) {
        // Makers won
        scoringTeam = gameState.makerTeam;
        if (makerTricks === 5) {
            // March (all 5 tricks)
            pointsAwarded = gameState.makerIsAlone ? 4 : 2;
            scoringMessage = gameState.makerIsAlone ?
                `${makerTeamName} march alone! +4 points` :
                `${makerTeamName} march! +2 points`;
        } else {
            // 3 or 4 tricks
            pointsAwarded = 1;
            scoringMessage = `${makerTeamName} make it! +1 point`;
        }
    } else {
        // Defenders won (euchre)
        scoringTeam = 1 - gameState.makerTeam;
        pointsAwarded = 2;
        scoringMessage = `${defenderTeamName} euchred ${makerTeamName}! +2 points`;
    }

    // Update game score
    gameState.score[scoringTeam] += pointsAwarded;

    console.log('Hand complete:', scoringMessage);
    console.log('Maker team:', gameState.makerTeam, 'Tricks:', makerTricks);
    console.log('New score:', gameState.score);

    // Switch back to message mode for scoring summary
    showMessageMode();

    messageEl.textContent = scoringMessage;
    updateUI(); // Update score display

    const isGameOver = gameState.score[0] >= gameState.settings.winningScore || gameState.score[1] >= gameState.settings.winningScore;

    if (scoringTeam === 1 - gameState.makerTeam) {
        // Trigger visual "Euchred" overlay, passing whether game is over
        showEuchredOverlay(scoringTeam, isGameOver);
        // Do NOT auto-advance; the overlay's button will handle starting the next round
    } else {
        // Check for game over (first to winningScore points wins)
        if (isGameOver) {
            setTimeout(endGame, 3000);
        } else {
            // Rotate dealer and start new hand
            gameState.dealer = (gameState.dealer + 1) % 4;
            setTimeout(initGame, 3600);
        }
    }
}

// End the game (someone reached the winning score)
function endGame() {
    let winner;
    let isPlayerWin = gameState.score[0] >= gameState.settings.winningScore;
    if (isPlayerWin) {
        winner = 'You and Your Teammate';
    } else {
        winner = 'Fucker 2 and Fucker 1';
    }

    showMessageMode();
    messageEl.textContent = `Game Over! ${winner} win ${gameState.score[0]}-${gameState.score[1]}!`;

    console.log('Game Over:', winner, 'Final score:', gameState.score);

    // Show the game won overlay
    showGameWonOverlay(isPlayerWin);
}

// Show the Game Won overlay effect
function showGameWonOverlay(isPlayerWin) {
    const overlay = document.getElementById('game-won-overlay');
    if (!overlay) return;

    overlay.className = 'game-won-overlay';

    // The user requested this specific GIF
    const gifHtml = `<img src="https://media.giphy.com/media/dkuZHIQsslFfy/giphy.gif" alt="Game Over" class="game-won-gif" />`;

    if (isPlayerWin) {
        overlay.classList.add('team-you');
        overlay.innerHTML = `<h1>YOU WON!</h1>${gifHtml}<p>Great job!</p>`;
    } else {
        overlay.classList.add('team-opponent');
        overlay.innerHTML = `<h1>GAME OVER</h1>${gifHtml}<p>They beat you...</p>`;
    }

    overlay.innerHTML += `<button id="game-won-continue-btn" class="dialog-btn">Play again</button>`;

    // Add event listener to the button
    const btn = overlay.querySelector('#game-won-continue-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            overlay.classList.remove('active');
            startNewGame();
        });
    }

    overlay.classList.add('active');
}

// Helper function to get the name of a card
function getCardName(card) {
    if (!card) {
        console.error('getCardName called with null card');
        return 'Unknown Card';
    }

    // Map card values to full names
    const valueNames = {
        'J': 'Jack',
        'Q': 'Queen',
        'K': 'King',
        'A': 'Ace'
    };

    const displayValue = valueNames[card.value] || card.value;
    return `${displayValue} of ${card.suit}`;
}

// Show the Euchred overlay effect
function showEuchredOverlay(scoringTeam, isGameOver = false) {
    const overlay = document.getElementById('euchred-overlay');
    if (!overlay) return;

    // Clear classes and reapply
    overlay.className = 'euchred-overlay';

    let gifHtml = '';
    if (scoringTeam === 0) {
        const airhumpGifs = [
            'https://media.tenor.com/ikh571CZa3kAAAAM/shad6666.gif',
            'https://media.tenor.com/IE01vcJ1ixUAAAAM/ted-jugueton-ted.gif',
            'https://media.tenor.com/t9hWWFdlEaMAAAAM/grind-grinding.gif',
            'https://media.tenor.com/fF_-a5PTswwAAAAM/hump-scooby-doo.gif'
        ];
        const randomGif = airhumpGifs[Math.floor(Math.random() * airhumpGifs.length)];
        gifHtml = `<img src="${randomGif}" alt="Airhump" class="euchred-gif" />`;

        overlay.classList.add('team-you');
        overlay.innerHTML = `<h1>Nice.</h1>${gifHtml}<p>You euchred those fucks!</p>`;
    } else {
        const damnitGifs = [
            'https://media.tenor.com/nUwPBNi-GOoAAAAM/shit-leslie-jordan.gif',
            'https://media.tenor.com/Dne0Xom0BLQAAAAM/dammit-damn.gif',
            'https://media.tenor.com/UIiYoDrxIeQAAAAM/damn-it-brat.gif',
            'https://media.tenor.com/2LE3QFtLTnwAAAAM/angry-magic.gif'
        ];
        const randomGif = damnitGifs[Math.floor(Math.random() * damnitGifs.length)];
        gifHtml = `<img src="${randomGif}" alt="Damnit" class="euchred-gif" />`;

        overlay.classList.add('team-opponent');
        overlay.innerHTML = `<h1>Sheeeeeeit...</h1>${gifHtml}<p>They euchred you!</p>`;
    }

    const btnText = isGameOver ? 'Start New Game' : 'Start Next Round';
    overlay.innerHTML += `<button id="euchred-continue-btn" class="dialog-btn">${btnText}</button>`;

    // Add event listener to the button
    const btn = overlay.querySelector('#euchred-continue-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            overlay.classList.remove('active');
            if (isGameOver) {
                endGame();
            } else {
                gameState.dealer = (gameState.dealer + 1) % 4;
                initGame();
            }
        });
    }

    overlay.classList.add('active');
}

// Helper function to check if a card is a bower
function isBower(card, trumpSuit) {
    if (!card || !trumpSuit) return false;
    return (card.value === 'J' && (card.suit === trumpSuit || getSuitOfLeftBower(card) === trumpSuit));
}

// Helper function to get partner index
function getPartnerIndex(playerIndex) {
    // Partners are across from each other: 0-2 (You-Teammate), 1-3 (Fucker1-Fucker2)
    switch (playerIndex) {
        case 0: return 2; // Your partner is Teammate
        case 1: return 3; // Fucker 1's partner is Fucker 2
        case 2: return 0; // Teammate's partner is You
        case 3: return 1; // Fucker 2's partner is Fucker 1
        default: return -1;
    }
}

// Helper function to get the suit of the left bower
function getSuitOfLeftBower(card) {
    if (!card || card.value !== 'J') return null;

    switch (card.suit) {
        case 'hearts': return 'diamonds';
        case 'diamonds': return 'hearts';
        case 'clubs': return 'spades';
        case 'spades': return 'clubs';
        default: return null;
    }
}

// Helper function to get the effective suit of a card (considering trump and bowers)
function getEffectiveSuit(card, trumpSuit) {
    if (!card) return null;
    if (!trumpSuit) return card.suit;

    // Right bower (Jack of trump suit) is trump
    if (card.value === 'J' && card.suit === trumpSuit) {
        return trumpSuit;
    }

    // Left bower (Jack of same color as trump) is also trump
    if (card.value === 'J' && getSuitOfLeftBower(card) === trumpSuit) {
        return trumpSuit;
    }

    // All other cards are their natural suit
    return card.suit;
}

// Helper function to check if player can play a specific card
function canPlayCard(card, playerHand, leadSuit, trumpSuit) {
    // If no lead suit yet, any card can be played
    if (!leadSuit) return true;

    const cardEffectiveSuit = getEffectiveSuit(card, trumpSuit);

    // Check if player has any cards of the lead suit
    const hasLeadSuit = playerHand.some(handCard =>
        getEffectiveSuit(handCard, trumpSuit) === leadSuit
    );

    // If player has cards of the lead suit, they must play one
    if (hasLeadSuit) {
        return cardEffectiveSuit === leadSuit;
    }

    // If player doesn't have the lead suit, they can play any card
    return true;
}

// Show rule violation popup
function showRulePopup(message) {
    rulePopupMessage.textContent = message;
    $(rulePopup).fadeIn(200);

    // Hide popup after 2 seconds
    setTimeout(() => {
        $(rulePopup).fadeOut(300);
    }, 2000);
}

// Show AI decision popup
function showAIDecision(playerIndex, decision, suit = null) {
    const playerNames = ['You', 'Fucker 1', 'Your Teammate', 'Fucker 2'];
    const playerClasses = ['south-player', 'west-player', 'north-player', 'east-player'];
    console.log('=== showAIDecision called ===');
    console.log('Player:', playerIndex, '(' + playerNames[playerIndex] + ')');
    console.log('Decision:', decision);
    console.log('Suit:', suit);
    console.log('Popup currently visible:', $(aiDecisionPopup).is(':visible'));
    console.trace('Call stack:');

    // If popup is already visible, hide it first
    if ($(aiDecisionPopup).is(':visible')) {
        console.log('Hiding existing popup before showing new one');
        $(aiDecisionPopup).fadeOut(100);
        // Remove any existing classes
        aiDecisionPopup.className = aiDecisionPopup.className.replace(/\b(north|south|east|west)-player\b/g, '');
    }
    let message = '';

    if (decision === 'order_up') {
        message = `${playerNames[playerIndex]} orders up ${suit}!`;
    } else if (decision === 'order_up_alone') {
        message = `${playerNames[playerIndex]} orders up ${suit} and goes alone!`;
    } else if (decision === 'pass') {
        message = `${playerNames[playerIndex]} passes`;
    } else if (decision === 'call_trump') {
        message = `${playerNames[playerIndex]} calls ${suit} trump!`;
    } else if (decision === 'call_trump_alone') {
        message = `${playerNames[playerIndex]} calls ${suit} trump and goes alone!`;
    } else if (decision === 'call_trump_forced') {
        message = `${playerNames[playerIndex]} is forced to name ${suit} trump! (Stick the Dealer)`;
    } else if (decision === 'call_trump_alone_forced') {
        message = `${playerNames[playerIndex]} is forced to name ${suit} trump and goes alone! (Stick the Dealer)`;
    }

    // Remove any existing player position classes
    const oldClasses = aiDecisionPopup.className;
    aiDecisionPopup.className = aiDecisionPopup.className.replace(/\b(north|south|east|west)-player\b/g, '');
    console.log('Removed classes:', oldClasses, '→', aiDecisionPopup.className);

    // Add the appropriate player position class
    const newClass = playerClasses[playerIndex];
    aiDecisionPopup.classList.add(newClass);
    console.log('Added class:', newClass, 'for player', playerIndex);

    aiDecisionMessage.textContent = message;

    // Small delay to ensure previous popup is hidden if there was one
    const showDelay = $(aiDecisionPopup).is(':visible') ? 150 : 0;
    setTimeout(() => {
        $(aiDecisionPopup).fadeIn(300);
    }, showDelay);

    // Hide popup after 2.5 seconds
    setTimeout(() => {
        $(aiDecisionPopup).fadeOut(300, function () {
            // Remove player position class AFTER fadeOut is complete
            aiDecisionPopup.className = aiDecisionPopup.className.replace(/\b(north|south|east|west)-player\b/g, '');
            console.log('Popup hidden and classes cleared');
        });
    }, 2500); // Increased for better readability
}
// --- AI STRATEGY HELPERS ---

/**
 * Evaluates the strength of a hand for a potential trump suit.
 * Returns a score where higher is better.
 * Points:
 * - Right Bower: 4 points
 * - Left Bower: 4 points
 * - Ace of Trump: 3 points
 * - King of Trump: 2.5 points
 * - Queen of Trump: 2 points
 * - 10 of Trump: 1.5 points
 * - 9 of Trump: 1 point
 * - Off-suit Ace: 1 point
 * - Singleton (with trump): 1 point
 * - Void (with trump): 1.5 points
 */
function evaluateHandStrength(hand, trumpSuit) {
    let score = 0;
    let hasTrump = false;
    let trumpCount = 0;
    let hasRightBower = false;
    let hasLeftBower = false;
    let suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };

    hand.forEach(card => {
        const effectiveSuit = getEffectiveSuit(card, trumpSuit);
        suitCounts[effectiveSuit]++;

        if (effectiveSuit === trumpSuit) {
            hasTrump = true;
            trumpCount++;
            // Differentiate Right vs Left bower
            if (card.value === 'J' && card.suit === trumpSuit) {
                score += 5; // Right bower — the best card in the game
                hasRightBower = true;
            } else if (card.value === 'J') {
                score += 4.5; // Left bower — second best
                hasLeftBower = true;
            } else if (card.value === 'A') {
                score += 3.5;
            } else if (card.value === 'K') {
                score += 2.5;
            } else if (card.value === 'Q') {
                score += 2;
            } else if (card.value === '10') {
                score += 1.5;
            } else if (card.value === '9') {
                score += 0.5; // 9 of trump is nearly worthless
            }
        } else if (card.value === 'A') {
            score += 2; // Off-suit Ace is a likely trick winner (increased from 1)
        } else if (card.value === 'K') {
            score += 0.5; // Off-suit King has some value
        }
    });

    // Bonuses for distribution (only if we have trump to make it useful)
    if (hasTrump) {
        Object.keys(suitCounts).forEach(suit => {
            if (suit !== trumpSuit) {
                if (suitCounts[suit] === 0) score += 2; // Void — very powerful (can trump in)
                else if (suitCounts[suit] === 1) score += 1; // Singleton — can create void next trick
            }
        });
    }

    // Trump count bonus — having 3+ trump is very strong
    if (trumpCount >= 3) score += 1.5;
    if (trumpCount >= 4) score += 2;

    // Both bowers is extremely strong
    if (hasRightBower && hasLeftBower) score += 2;

    return score;
}

/**
 * Returns the "Next" suit (same color) for a given suit.
 */
function getNextSuit(suit) {
    const nextMap = {
        'hearts': 'diamonds',
        'diamonds': 'hearts',
        'clubs': 'spades',
        'spades': 'clubs'
    };
    return nextMap[suit];
}

/**
 * Returns the "Cross" suits (opposite color) for a given suit.
 */
function getCrossSuits(suit) {
    if (suit === 'hearts' || suit === 'diamonds') {
        return ['clubs', 'spades'];
    } else {
        return ['hearts', 'diamonds'];
    }
}

// Show user turn dialog
function showUserTurnDialog(message, dialogType = 'info') {
    console.log('showUserTurnDialog called - Current player:', gameState.currentPlayer, 'Message:', message);

    // Only show dialog if it's actually the user's turn
    if (gameState.currentPlayer !== 0) {
        console.warn('Attempted to show user dialog when it\'s not user\'s turn. Current player:', gameState.currentPlayer);
        return;
    }

    userTurnMessage.textContent = message;
    userTurnTitle.textContent = 'Your Turn!';

    // Hide all interactive elements first
    suitSelection.classList.remove('show');
    dialogActions.classList.remove('show');

    // Show appropriate interactive elements based on dialog type
    if (dialogType === 'bidding') {
        dialogActions.classList.add('show');
    } else if (dialogType === 'suit_selection' || dialogType === 'suit_selection_forced') {
        suitSelection.classList.add('show');

        // Get the pass button in suit selection
        const suitPassBtn = document.getElementById('suit-pass-btn');

        // Filter out the candidate suit (can't call the same suit that was turned down)
        const candidateSuit = gameState.trumpCandidate.suit;
        const suitCards = suitSelection.querySelectorAll('.suit-card');
        suitCards.forEach(card => {
            const suit = card.dataset.suit;
            if (suit === candidateSuit) {
                card.style.opacity = '0.3';
                card.style.pointerEvents = 'none';
                card.title = 'Cannot call this suit (was turned down)';
            } else {
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
                if (dialogType === 'suit_selection_forced') {
                    card.title = `Must choose ${suit} (Fuck the Dealer)`;
                } else {
                    card.title = `Call ${suit} trump`;
                }
            }
        });

        // If forced selection, hide pass button and change the title to be more urgent
        if (dialogType === 'suit_selection_forced') {
            userTurnTitle.textContent = 'MUST NAME TRUMP!';
            userTurnTitle.style.color = '#e74c3c';
            if (suitPassBtn) suitPassBtn.style.display = 'none';
        } else {
            userTurnTitle.style.color = '';
            if (suitPassBtn) suitPassBtn.style.display = 'block';
        }
    }

    $(userTurnDialog).fadeIn(300);
}

// Hide user turn dialog
function hideUserTurnDialog() {
    suitSelection.classList.remove('show');
    dialogActions.classList.remove('show');
    $(userTurnDialog).fadeOut(300);
}

// Update turn indicators
function updateTurnIndicators() {
    const indicators = ['south-indicator', 'west-indicator', 'north-indicator', 'east-indicator'];

    // Remove active class from all indicators
    indicators.forEach(id => {
        $('#' + id).removeClass('active');
    });

    // Add active class to current player's indicator
    $('#' + indicators[gameState.currentPlayer]).addClass('active');
}

// Update trick tally marks for a player
function updateTrickTally(playerIndex) {
    // Map player index to their tally element and team
    const tallyIds = ['south-tally', 'west-tally', 'north-tally', 'east-tally'];
    const teams = [0, 1, 0, 1]; // south+north = team 0, west+east = team 1

    // Update the winning player's tally element to show their individual trick wins
    const tallyEl = document.getElementById(tallyIds[playerIndex]);
    if (tallyEl) {
        // Count how many tricks this specific player won (track per-player in gameState)
        if (!gameState.playerTricks) gameState.playerTricks = [0, 0, 0, 0];
        gameState.playerTricks[playerIndex] = (gameState.playerTricks[playerIndex] || 0) + 1;
        tallyEl.textContent = CROWN.repeat(gameState.playerTricks[playerIndex]);
    }
}

// Clear all trick tally marks (called at start of new hand)
function clearTrickTallies() {
    const tallyElements = ['south-tally', 'west-tally', 'north-tally', 'east-tally'];
    tallyElements.forEach(id => {
        const tallyEl = document.getElementById(id);
        if (tallyEl) {
            tallyEl.textContent = '';
        }
    });
    // Reset per-player trick counts for the new hand
    gameState.playerTricks = [0, 0, 0, 0];

    // Also reset the header crowns
    updateTrickTallyDisplay();
}

// Update dealer badges and maker badges
function updateDealerBadges() {
    const dealerBadges = ['south-dealer', 'west-dealer', 'north-dealer', 'east-dealer'];
    const makerBadges = ['south-maker', 'west-maker', 'north-maker', 'east-maker'];

    // Update dealer badges
    dealerBadges.forEach((id, index) => {
        const badge = $('#' + id);
        if (index === gameState.dealer) {
            badge.addClass('active');
        } else {
            badge.removeClass('active');
        }
    });

    // Update maker badges
    makerBadges.forEach((id, index) => {
        const badge = $('#' + id);
        if (gameState.makerIndex !== null && index === gameState.makerIndex) {
            badge.addClass('active');

            // Add "ALONE" text if maker is alone
            if (gameState.makerIsAlone) {
                badge.text('MAKER (ALONE)');
            } else {
                badge.text('MAKER');
            }
        } else {
            badge.removeClass('active');
        }
    });
}

// Update the UI
function updateUI() {
    // Update score display
    document.getElementById('team1-score').textContent = gameState.score[0];
    document.getElementById('team2-score').textContent = gameState.score[1];

    // Update turn indicators and dealer badges
    updateTurnIndicators();
    updateDealerBadges();
}

// Render a single player card with optional animation
function renderPlayerCard(card, index, animate = false) {
    const cardEl = createCardElement(card, index, false);
    if (animate) {
        cardEl.classList.add('dealing');
    }
    playerHandEl.appendChild(cardEl);
}

// Render a single computer card (face down) with optional animation
function renderComputerCard(playerIndex, cardIndex, animate = false) {
    const cardEl = createCardBackElement();
    if (animate) {
        cardEl.classList.add('dealing');
    }

    // Set z-index explicitly to avoid stacking jumps during animation
    cardEl.style.zIndex = 10 + cardIndex;

    handElements[playerIndex].appendChild(cardEl);
}

// Render the player's hand
function renderPlayerHand() {
    playerHandEl.innerHTML = '';

    gameState.playerHand.forEach((card, index) => {
        renderPlayerCard(card, index);
    });

    // Re-center the fan based on remaining card count
    updateSouthHandFan();

    // Update visibility based on going alone status
    updatePartnerHandVisibility();
}

// Dynamically recompute south hand fan rotations centered at 0° based on how many cards remain
function updateSouthHandFan() {
    const cards = playerHandEl.querySelectorAll('.card');
    const count = cards.length;
    if (count === 0) return;

    const isMobile = window.innerWidth <= 480;
    const spread = isMobile ? 12 : 24; // degrees between each card
    // Use Math.min(count, 5) so the fan doesn't shift left and clip when holding 6 cards (trump candidate phase)
    const centerMathCount = Math.min(count, 5);
    
    cards.forEach((card, i) => {
        let rotation = 0;
        let baseTransform = '';

        if (i === 5) {
            // Trump candidate (6th card): move to the right, don't rotate, let it clip partially off screen
            rotation = 0;
            baseTransform = `translateX(8.5rem) translateY(1rem) rotate(0deg)`;
        } else {
            rotation = ((i - (centerMathCount - 1) / 2) * spread);
            baseTransform = `rotate(${rotation}deg)`;
        }
        
        card.style.transform = baseTransform;
        // Store for reference (not used for hover anymore)
        card.style.setProperty('--fan-rotation', `${rotation}deg`);

        // Attach hover: slide outwards in the direction the card is facing by appending translateY *after* rotate.
        // CSS transform order: rightmost applied first in matrix chain → local-space translate.
        // We re-attach fresh listeners each time the fan updates to stay in sync.
        const oldEnter = card._hoverEnter;
        const oldLeave = card._hoverLeave;
        if (oldEnter) card.removeEventListener('mouseenter', oldEnter);
        if (oldLeave) card.removeEventListener('mouseleave', oldLeave);

        const onEnter = () => {
            card.style.transform = `${baseTransform} translateY(-1.4rem)`;
        };
        const onLeave = () => {
            card.style.transform = baseTransform;
        };

        card._hoverEnter = onEnter;
        card._hoverLeave = onLeave;
        card.addEventListener('mouseenter', onEnter);
        card.addEventListener('mouseleave', onLeave);
    });
}


// Render all computer hands
function renderComputerHands() {
    // Remove any lingering trump-pickup cards that were positioned absolutely outside their hand container
    document.querySelectorAll('.card.trump-pickup').forEach(el => el.remove());

    // Clear all computer hands
    northHandEl.innerHTML = '';
    eastHandEl.innerHTML = '';
    westHandEl.innerHTML = '';

    // Render each computer hand
    gameState.computerHands.forEach((hand, playerIndex) => {
        hand.forEach((card, cardIndex) => {
            renderComputerCard(playerIndex + 1, cardIndex);
        });
    });

    // Hide partner's hand if someone is going alone
    updatePartnerHandVisibility();
}

// Hide or show partner's hand based on going alone status
function updatePartnerHandVisibility() {
    const handElements = [playerHandEl, westHandEl, northHandEl, eastHandEl];

    // Show all hands by default
    handElements.forEach(handEl => {
        handEl.style.display = '';
    });

    // If someone is going alone, hide their partner's hand
    if (gameState.makerIsAlone && gameState.partnerSittingOut !== null) {
        const partnerHandEl = handElements[gameState.partnerSittingOut];
        if (partnerHandEl) {
            partnerHandEl.style.display = 'none';
        }
    }
}

// Create a card element
function createCardElement(card, index, faceDown = false) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    if (index !== undefined) {
        cardEl.dataset.index = index;
    }

    if (faceDown) {
        cardEl.classList.add('card-back');
        return cardEl;
    }

    if (!card) {
        console.error('createCardElement called with null card');
        cardEl.classList.add('card-back');
        return cardEl;
    }

    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    if (isRed) {
        cardEl.classList.add('red');
    } else {
        cardEl.classList.add('black');
    }

    // Add trump styling if this is a trump card
    if (gameState.trumpSuit && isCardTrump(card, gameState.trumpSuit)) {
        cardEl.classList.add('is-trump');
    }

    // Add trump pickup styling if this is the picked up trump card
    if (card.isTrumpPickup) {
        cardEl.classList.add('trump-pickup');
    }

    // Add the card value and suit in top-left corner
    const valueEl = document.createElement('div');
    valueEl.className = 'card-value';
    valueEl.textContent = card.value;

    const suitEl = document.createElement('div');
    suitEl.className = 'card-suit';
    suitEl.textContent = SUIT_SYMBOLS[card.suit] || '';

    // Add the card value and suit in bottom-right corner (rotated)
    const valueElBottom = document.createElement('div');
    valueElBottom.className = 'card-value card-value-bottom';
    valueElBottom.textContent = card.value;

    const suitElBottom = document.createElement('div');
    suitElBottom.className = 'card-suit card-suit-bottom';
    suitElBottom.textContent = SUIT_SYMBOLS[card.suit] || '';

    cardEl.appendChild(valueEl);
    cardEl.appendChild(suitEl);
    cardEl.appendChild(valueElBottom);
    cardEl.appendChild(suitElBottom);

    // Explicitly set base z-index to avoid stacking jumps during deal
    if (index !== undefined) {
        cardEl.style.zIndex = 10 + index;
    }

    // Attempt to update the fan dynamically if playerHandEl is accessible
    setTimeout(() => {
        if (typeof updateSouthHandFan === 'function') {
            updateSouthHandFan();
        }
    }, 10);

    return cardEl;
}

// Create a card back element
function createCardBackElement() {
    const cardEl = document.createElement('div');
    cardEl.className = 'card card-back';
    return cardEl;
}

// Show the trump candidate card
function showTrumpCandidate() {
    const topCard = gameState.deck[gameState.deck.length - 1];
    gameState.trumpCandidate = topCard;

    if (!topCard) {
        console.error('No trump candidate available - deck length:', gameState.deck.length);
        console.error('Deck contents:', gameState.deck);
        return;
    }

    // Only flip the card in the center deck pile - don't show in corner yet
    flipTopCardOfDeck(topCard);

    // Trump candidate is now visible in the center deck

    // Show dealer connection line after a brief delay
    setTimeout(() => {
        showDealerConnectionLine();
    }, 800);

    // Start the bidding process
    setTimeout(startBidding, 1200); // Slowed from 1000 to 1200
}

// Show the dealer connection line from trump candidate to dealer
function showDealerConnectionLine() {
    const svg = document.getElementById('dealer-connection-line');
    const path = document.getElementById('dealer-path');
    const centerDeck = document.getElementById('center-deck');

    if (!svg || !path || !centerDeck) return;

    // Get dealer's hand element
    const handElements = [
        document.getElementById('player-hand'),
        document.getElementById('west-hand'),
        document.getElementById('north-hand'),
        document.getElementById('east-hand')
    ];
    const dealerHand = handElements[gameState.dealer];

    if (!dealerHand) return;

    // Get positions relative to the game board
    const gameBoard = document.querySelector('.game-board');
    const gameBoardRect = gameBoard.getBoundingClientRect();
    const centerRect = centerDeck.getBoundingClientRect();
    const dealerRect = dealerHand.getBoundingClientRect();

    // Calculate center points relative to game board
    const startX = centerRect.left + centerRect.width / 2 - gameBoardRect.left;
    const startY = centerRect.top + centerRect.height / 2 - gameBoardRect.top;
    const endX = dealerRect.left + dealerRect.width / 2 - gameBoardRect.left;
    const endY = dealerRect.top + dealerRect.height / 2 - gameBoardRect.top;

    // Calculate control point for curve (midpoint offset perpendicular to line)
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const curvature = distance * 0.15; // 15% curve

    // Perpendicular offset
    const offsetX = -dy / distance * curvature;
    const offsetY = dx / distance * curvature;
    const controlX = midX + offsetX;
    const controlY = midY + offsetY;

    // Create quadratic bezier curve path
    const pathData = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
    path.setAttribute('d', pathData);

    // Set SVG viewBox to cover the entire game board
    svg.setAttribute('viewBox', `0 0 ${gameBoardRect.width} ${gameBoardRect.height}`);
    svg.setAttribute('width', gameBoardRect.width);
    svg.setAttribute('height', gameBoardRect.height);

    // Update gradient orientation based on line direction
    const gradient = document.getElementById('lineGradient');
    if (gradient) {
        // Determine if line is more vertical or horizontal
        const isVertical = Math.abs(dy) > Math.abs(dx);

        if (isVertical) {
            // Vertical gradient for north/south players
            gradient.setAttribute('x1', '0%');
            gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '0%');
            gradient.setAttribute('y2', '100%');
        } else {
            // Horizontal gradient for east/west players
            gradient.setAttribute('x1', '0%');
            gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '100%');
            gradient.setAttribute('y2', '0%');
        }
    }

    // Show the line
    svg.classList.add('active');
}

// Hide the dealer connection line
function hideDealerConnectionLine() {
    const svg = document.getElementById('dealer-connection-line');
    if (svg) {
        svg.classList.remove('active');
    }
}

// Flip the top card of the center deck pile
function flipTopCardOfDeck(card) {
    const centerDeck = document.getElementById('center-deck');
    if (!centerDeck) return;

    // Find the top card back in the center deck
    const deckCards = centerDeck.querySelectorAll('.deck-card');
    if (deckCards.length > 0) {
        const topCardBack = deckCards[deckCards.length - 1];

        // Create the trump card starting as a card back
        const trumpCard = createCardBackElement();
        trumpCard.style.position = 'absolute';
        trumpCard.style.top = topCardBack.style.top;
        trumpCard.style.left = topCardBack.style.left;
        trumpCard.style.zIndex = parseInt(topCardBack.style.zIndex) + 1;
        trumpCard.style.transition = 'transform 0.6s ease-in-out';

        // Add to center deck
        centerDeck.appendChild(trumpCard);

        // Animate the flip to reveal the face
        setTimeout(() => {
            trumpCard.style.transform = 'rotateY(180deg)';

            // Replace with face-up card at the midpoint of the flip
            setTimeout(() => {
                const faceUpCard = createCardElement(card);
                faceUpCard.style.position = 'absolute';
                faceUpCard.style.top = topCardBack.style.top;
                faceUpCard.style.left = topCardBack.style.left;
                faceUpCard.style.zIndex = parseInt(topCardBack.style.zIndex) + 1;
                faceUpCard.classList.add('trump-candidate-card');
                faceUpCard.style.transform = 'rotateY(180deg)';
                faceUpCard.style.transition = 'transform 0.3s ease-in-out';

                // Replace the card back with the face-up card
                centerDeck.removeChild(trumpCard);
                centerDeck.appendChild(faceUpCard);

                // Complete the flip to show the face
                setTimeout(() => {
                    faceUpCard.style.transform = 'rotateY(0deg)';
                }, 50);
            }, 300);
        }, 100);

        // Hide ALL deck cards underneath the trump candidate
        deckCards.forEach(deckCard => {
            deckCard.style.opacity = '0';
        });
    }
}

// Render the trump card
function renderTrumpCard(card) {
    if (!card) {
        $(trumpCardEl).fadeOut(300, function () {
            $(this).empty();
        });
        return;
    }

    const cardEl = createCardElement(card);
    trumpCardEl.innerHTML = '';
    trumpCardEl.appendChild(cardEl);

    // Animate the trump card appearance
    $(cardEl).hide().fadeIn(500);
}

// Animate a card from its current position to the center of the table
function animateCardToCenter(cardEl, card, playerIndex) {
    const gameBoard = document.querySelector('.game-board');
    const gameBoardRect = gameBoard.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();

    // Calculate current coordinate relative to game board
    const currentX = cardRect.left - gameBoardRect.left;
    const currentY = cardRect.top - gameBoardRect.top;

    // Immediately render the final native card to its formal DOM slot invisibly!
    // The CSS logic will natively snap it into its precise slot!
    renderTrickCard(card, playerIndex);

    // Fetch this node to extract its formal footprint coordinates
    const finalTrickCard = trickCardsEl.lastElementChild;
    finalTrickCard.style.visibility = 'hidden';
    finalTrickCard.style.opacity = '0';

    // Harvest the exact geometric layout coordinate calculated physically by the browser natively
    const targetRect = finalTrickCard.getBoundingClientRect();
    const targetX = targetRect.left - gameBoardRect.left;
    const targetY = targetRect.top - gameBoardRect.top;

    // Create our flying clone
    const animatingCard = cardEl.cloneNode(true);
    animatingCard.style.position = 'absolute';
    animatingCard.style.margin = '0';
    // Top-left origin allows perfect `left/top` CSS rendering parity across scales without offset drift!
    animatingCard.style.transformOrigin = 'top left';
    animatingCard.style.left = currentX + 'px';
    animatingCard.style.top = currentY + 'px';
    animatingCard.style.zIndex = '1000';
    // Constrain to the true visual 1.4 scale explicitly!
    animatingCard.style.transform = `scale(1.4)`;
    animatingCard.style.transition = 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    animatingCard.classList.add('animating');

    // Mount to absolute plane
    gameBoard.appendChild(animatingCard);

    // Turn source invisible
    cardEl.style.opacity = '0';

    // On exact next frame, execute math sweep to identical layout footprint
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            animatingCard.style.left = targetX + 'px';
            animatingCard.style.top = targetY + 'px';
        });
    });

    // When flight bridges cleanly
    setTimeout(() => {
        // Destroy clone plane item
        gameBoard.removeChild(animatingCard);

        // Turn on the native integrated DOM card exactly in position
        finalTrickCard.style.visibility = 'visible';
        finalTrickCard.style.opacity = '1';

        // Re-render the hand formally to splice out the original DOM completely
        if (playerIndex === 0) {
            renderPlayerHand();
        } else {
            renderComputerHands();
        }
    }, 500);
}

// Populate the center deck with card backs
function populateCenterDeck() {
    let centerDeck = document.getElementById('center-deck');
    if (!centerDeck) {
        centerDeck = document.createElement('div');
        centerDeck.className = 'center-deck';
        centerDeck.id = 'center-deck';
        trickCardsEl.appendChild(centerDeck);
    }

    // Explicitly revive it from its offscreen animation state if it was dismissed last game
    centerDeck.classList.remove('animate-offscreen');

    // Clear any existing cards (including hidden ones)
    centerDeck.innerHTML = '';

    // Create a stack of card backs to represent the deck (24 cards total)
    for (let i = 0; i < 24; i++) {
        const cardBack = createCardBackElement();
        cardBack.style.position = 'absolute';
        cardBack.style.top = (-i * 2) + 'px';
        /* DO NOT set left = 0px here! It overrides the base CSS `left: 50%; margin-left: -3.025rem;` 
           that actually perfectly centers the card in the center-deck. */
        cardBack.style.zIndex = i;
        cardBack.style.display = 'block'; // Ensure cards are visible
        cardBack.style.opacity = '1'; // Ensure full opacity
        cardBack.classList.add('deck-card');
        cardBack.dataset.cardIndex = i; // Track which card this is
        centerDeck.appendChild(cardBack);
    }
}

// Show the deck in the center of the table (legacy function - now just populates)
function showDeckInCenter() {
    // Ensure the center deck container is visible
    const centerDeck = document.getElementById('center-deck');
    if (centerDeck) {
        centerDeck.style.display = 'block';
        centerDeck.style.opacity = '1';
    }
    populateCenterDeck();
}

// Move trump candidate from center to trump area (now just shows corner icons)
function moveTrumpCandidateToTrumpArea() {
    // Trump icons will be shown by showTrumpArea() - no card display needed
    return;
}

// Hide the trump candidate from center deck (when trump is chosen)
function hideTrumpCandidate() {
    const centerDeck = document.getElementById('center-deck');
    if (centerDeck) {
        const trumpCandidateCard = centerDeck.querySelector('.trump-candidate-card');
        if (trumpCandidateCard) {
            $(trumpCandidateCard).fadeOut(300, function () {
                trumpCandidateCard.remove();
            });
        }
        // Keeping the remaining deck cards visible horizontally on the table!
    }
}

// Hide the entire deck from the center (used when game ends)
function hideDeckInCenter() {
    const centerDeck = document.getElementById('center-deck');
    if (centerDeck) {
        $(centerDeck).fadeOut(300, function () {
            centerDeck.remove();
        });
    }
}

// Animate a card from the center deck to a player's hand
function animateCardFromCenter(card, playerIndex, dealIndex) {
    const gameBoard = document.querySelector('.game-board');
    const gameBoardRect = gameBoard.getBoundingClientRect();
    const centerDeck = document.getElementById('center-deck');
    const playArea = document.querySelector('.play-area');

    if (!centerDeck || !playArea) return; // Safety check

    const centerDeckRect = centerDeck.getBoundingClientRect();
    const playAreaRect = playArea.getBoundingClientRect();

    // Get target position based on player (in clockwise order)
    const handElements = [playerHandEl, westHandEl, northHandEl, eastHandEl];
    const targetHandEl = handElements[playerIndex];
    const targetRect = targetHandEl.getBoundingClientRect();

    // Calculate positions relative to the viewport, accounting for card dimensions
    // Start from center of deck, but offset by half card width/height so card appears centered on deck
    const cardWidth = 60; // Standard card width
    const cardHeight = 90; // Standard card height

    // Radical new approach: Use the actual deck card and transform it directly
    const allDeckCards = centerDeck.querySelectorAll('.deck-card');

    if (allDeckCards.length > 0) {
        // Take the top card from the deck and transform it into the animating card
        const topDeckCard = allDeckCards[allDeckCards.length - 1];

        // Get its current position
        const deckCardRect = topDeckCard.getBoundingClientRect();

        // Create the new card content
        const animatingCard = playerIndex === 0 ?
            createCardElement(card) : createCardBackElement();

        // Position it exactly where the deck card is
        animatingCard.style.position = 'fixed';
        animatingCard.style.margin = '0';
        animatingCard.style.left = deckCardRect.left + 'px';
        animatingCard.style.top = deckCardRect.top + 'px';
        animatingCard.style.width = deckCardRect.width + 'px';
        animatingCard.style.height = deckCardRect.height + 'px';
        animatingCard.style.zIndex = '1000';
        animatingCard.style.pointerEvents = 'none';

        // Remove the deck card and add the animating card
        topDeckCard.remove();
        document.body.appendChild(animatingCard);

        // Calculate target position
        const endX = targetRect.left + targetRect.width / 2 - deckCardRect.width / 2;
        const endY = targetRect.top + targetRect.height / 2 - deckCardRect.height / 2;

        // Force reflow then add transition
        animatingCard.offsetHeight;
        animatingCard.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

        setTimeout(() => {
            animatingCard.style.left = endX + 'px';
            animatingCard.style.top = endY + 'px';
            // No rotation during animation — CSS fan handles final rotation
        }, 100);

        // After animation completes, remove the animating card and add to hand
        setTimeout(() => {
            document.body.removeChild(animatingCard);

            if (playerIndex === 0) {
                // Find the correct index for this card in the current hand
                const correctIndex = gameState.playerHand.findIndex(c =>
                    c.suit === card.suit && c.value === card.value
                );
                if (correctIndex !== -1) {
                    renderPlayerCard(card, correctIndex);
                }
            } else {
                renderComputerCard(playerIndex, gameState.computerHands[playerIndex - 1].length - 1);
            }
        }, 700);
    } else {
        // Fallback if no deck cards available
        console.log('No deck cards available for animation');
    }
}

// Render a card in the trick area (center of table)
function renderTrickCard(card, playerIndex) {
    const cardEl = createCardElement(card);
    cardEl.classList.add('trick-card');

    // Natively predict the CSS play order slot
    // Because this runs *synchronously inside* the animation loop (before state commits cardsPlayed++)
    // we deliberately use `gameState.cardsPlayed + 1` to target `.play-order-1`, etc.
    const playOrder = gameState.cardsPlayed + 1;
    cardEl.classList.add(`play-order-${playOrder}`);

    // Add the card to the center trick area immediately (no fade)
    trickCardsEl.appendChild(cardEl);
}

// Enable card selection for the player
function enableCardSelection() {
    // Only enable clicking on the player's cards
    const playerCards = playerHandEl.querySelectorAll('.card');
    playerCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', handleCardClick);
    });
}

// Disable card selection
function disableCardSelection() {
    // Only disable clicking on the player's cards
    const playerCards = playerHandEl.querySelectorAll('.card');
    playerCards.forEach(card => {
        card.style.cursor = 'default';
        card.removeEventListener('click', handleCardClick);
    });
}

// Handle card click
function handleCardClick(event) {
    if (gameState.currentPlayer !== 0 || gameState.gamePhase !== 'playing') return;

    // Check if player is sitting out
    if (gameState.makerIsAlone && gameState.partnerSittingOut === 0) {
        showRulePopup('You are sitting out this hand - your partner is going alone!');
        return;
    }

    const cardEl = event.currentTarget;
    const cardIndex = parseInt(cardEl.dataset.index);
    const card = gameState.playerHand[cardIndex];

    if (!card) {
        console.error('No card found at index:', cardIndex);
        return;
    }

    // Validate the card according to Euchre rules
    if (!canPlayCard(card, gameState.playerHand, gameState.leadSuit, gameState.trumpSuit)) {
        // Show rule violation popup
        const leadSuitName = gameState.leadSuit.charAt(0).toUpperCase() + gameState.leadSuit.slice(1);
        showRulePopup(`You must follow suit! Play a ${leadSuitName} if you have one.`);
        return;
    }

    // Hide user turn dialog
    hideUserTurnDialog();

    // Disable card selection
    disableCardSelection();

    // Play the card
    playCard(card, 0);
}

// Event listeners
const centerDeck = document.getElementById('center-deck');

// Helper to start the game and hide setup UI
function triggerGameStart() {
    if (gameState.gamePhase !== 'setup') return;
    // Hide the start game button
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) startBtn.classList.add('hidden');
    startNewGame();
}

// Start Game button click
const startGameBtn = document.getElementById('start-game-btn');
if (startGameBtn) {
    startGameBtn.addEventListener('click', triggerGameStart);
}

// Deck click kept as fallback (clickable class is removed after start)
centerDeck.addEventListener('click', function () {
    if (gameState.gamePhase === 'setup') {
        triggerGameStart();
    }
});

// Removed old static button event listeners - now using contextual dialog buttons

// Get the Go Alone button element
const dialogGoAlone = document.getElementById('dialog-go-alone');

// Dialog button event listeners
dialogOrderUp.addEventListener('click', () => {
    hideUserTurnDialog();
    const topCard = gameState.deck[gameState.deck.length - 1];
    orderUp(topCard.suit, false); // Order up without going alone
});

dialogGoAlone.addEventListener('click', () => {
    hideUserTurnDialog();
    const topCard = gameState.deck[gameState.deck.length - 1];
    orderUp(topCard.suit, true); // Order up and go alone
});

dialogPass.addEventListener('click', () => {
    hideUserTurnDialog();
    pass();
});

// Suit selection Pass button event listener
const suitPassBtn = document.getElementById('suit-pass-btn');
if (suitPassBtn) {
    suitPassBtn.addEventListener('click', () => {
        hideUserTurnDialog();
        pass();
    });
}

// Initialize the page when it loads (but don't start the game)
window.addEventListener('DOMContentLoaded', () => {
    // Show welcome message with shine animation
    messageEl.textContent = 'Welcome to Euchre!';
    const messageContainer = document.querySelector('.game-message-container');
    if (messageContainer) {
        messageContainer.style.opacity = '1';
        messageContainer.style.transform = 'translateX(-50%) scale(1)';
    }

    // Set game phase to setup so deck click works
    gameState.gamePhase = 'setup';

    // Populate the center deck so it's visible from the start
    populateCenterDeck();

    // Suit card click handlers - handle going alone with Shift key
    document.querySelectorAll('.suit-card').forEach(card => {
        card.addEventListener('click', (event) => {
            const suit = event.currentTarget.dataset.suit;
            if (event.currentTarget.style.pointerEvents !== 'none') {
                // Check if shift key is held for going alone
                const goingAlone = event.shiftKey;
                hideUserTurnDialog();
                orderUp(suit, goingAlone);
                if (goingAlone) {
                    messageEl.textContent = `You call ${suit} trump and go alone!`;
                } else {
                    messageEl.textContent = `You call ${suit} trump!`;
                }
            }
        });
    });

    // Settings logic
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const settingWinningScore = document.getElementById('setting-winning-score');
    const settingStickDealer = document.getElementById('setting-stick-dealer');
    const settingDifficulty = document.getElementById('setting-difficulty');
    const difficultyDescription = document.getElementById('difficulty-description');

    const updateDifficultyDescription = () => {
        if (!difficultyDescription || !settingDifficulty) return;
        switch (settingDifficulty.value) {
            case 'casual':
                difficultyDescription.textContent = 'AI plays relaxed. It makes safer bids, rarely goes alone, and plays more forgivingly.';
                break;
            case 'intermediate':
                difficultyDescription.textContent = 'AI plays a balanced game with standard strategic bidding and gameplay.';
                break;
            case 'intense':
                difficultyDescription.textContent = 'AI is highly competitive. It uses advanced strategies like calling "Next", positional bidding, and going alone.';
                break;
        }
    };

    if (settingDifficulty) {
        settingDifficulty.addEventListener('change', updateDifficultyDescription);
    }

    if (settingsBtn && settingsModal && closeSettingsBtn) {
        settingsBtn.addEventListener('click', () => {
            // Apply current settings
            settingWinningScore.value = gameState.settings.winningScore;
            settingStickDealer.checked = gameState.settings.stickTheDealer;
            if (settingDifficulty) {
                settingDifficulty.value = gameState.settings.difficulty;
                updateDifficultyDescription();
            }
            const settingBeginnerMode = document.getElementById('setting-beginner-mode');
            if (settingBeginnerMode) settingBeginnerMode.checked = gameState.settings.beginnerMode;
            settingsModal.style.display = 'block';
        });

        closeSettingsBtn.addEventListener('click', () => {
            // Save settings
            gameState.settings.winningScore = parseInt(settingWinningScore.value, 10);
            gameState.settings.stickTheDealer = settingStickDealer.checked;
            if (settingDifficulty) gameState.settings.difficulty = settingDifficulty.value;
            const settingBeginnerMode = document.getElementById('setting-beginner-mode');
            if (settingBeginnerMode) {
                gameState.settings.beginnerMode = settingBeginnerMode.checked;
                document.body.classList.toggle('beginner-mode', gameState.settings.beginnerMode);
            }
            settingsModal.style.display = 'none';
        });

        // X button — closes without saving
        const modalCloseXBtn = document.getElementById('modal-close-x-btn');
        if (modalCloseXBtn) {
            modalCloseXBtn.addEventListener('click', () => {
                settingsModal.style.display = 'none';
            });
        }
    }
});
