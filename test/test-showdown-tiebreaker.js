const assert = require('assert');
const { PokerDeck } = require('../server/PokerDeck');

console.log('Testing PokerDeck showdown tiebreakers...');

// Case 1: Both have identical 5-card board hand (e.g. Royal Flush on board)
// Player A has single card A (val 14) and 2 (val 2), Player B has K (val 13) and Q (val 12)
const boardRoyal = [
  { suit: 'diamonds', value: 14, label: 'A' },
  { suit: 'diamonds', value: 13, label: 'K' },
  { suit: 'diamonds', value: 12, label: 'Q' },
  { suit: 'diamonds', value: 11, label: 'J' },
  { suit: 'diamonds', value: 10, label: '10' }
];

const pA = {
  player: {
    name: 'Player A',
    cards: [
      { suit: 'spades', value: 14, label: 'A' },
      { suit: 'hearts', value: 2, label: '2' }
    ]
  },
  evaluation: PokerDeck.evaluateHand([...boardRoyal, { suit: 'spades', value: 14, label: 'A' }, { suit: 'hearts', value: 2, label: '2' }])
};

const pB = {
  player: {
    name: 'Player B',
    cards: [
      { suit: 'clubs', value: 13, label: 'K' },
      { suit: 'hearts', value: 12, label: 'Q' }
    ]
  },
  evaluation: PokerDeck.evaluateHand([...boardRoyal, { suit: 'clubs', value: 13, label: 'K' }, { suit: 'hearts', value: 12, label: 'Q' }])
};

// 5-card evaluation is equal (Royal Flush)
assert.strictEqual(PokerDeck.compareEvaluated(pA.evaluation, pB.evaluation), 0, '5-card evaluations should be tied on board');

// In showdown, Player A should win because Player A has Ace (14) vs Player B highest card King (13)
const result1 = PokerDeck.comparePlayerShowdown(pA, pB);
assert.strictEqual(result1, 1, 'Player A should win by single card Ace > King');
console.log('✓ Case 1 Passed: Board-tied hand resolves by single card size (A > K)');

// Case 2: Identical single card point values, different second card
const pC = {
  player: {
    name: 'Player C',
    cards: [
      { suit: 'spades', value: 9, label: '9' },
      { suit: 'hearts', value: 8, label: '8' }
    ]
  },
  evaluation: { rank: 2, tieBreakers: [6, 14, 12, 10] } // Mock identical pair
};

const pD = {
  player: {
    name: 'Player D',
    cards: [
      { suit: 'clubs', value: 9, label: '9' },
      { suit: 'diamonds', value: 5, label: '5' }
    ]
  },
  evaluation: { rank: 2, tieBreakers: [6, 14, 12, 10] } // Mock identical pair
};

const result2 = PokerDeck.comparePlayerShowdown(pC, pD);
assert.strictEqual(result2, 1, 'Player C should win because second card 8 > 5');
console.log('✓ Case 2 Passed: 1st card tied (9 == 9), resolves by 2nd card (8 > 5)');

// Case 3: Identical single card point values on both cards (9 and 4 vs 9 and 4), resolved by suit
const pE = {
  player: {
    name: 'Player E',
    cards: [
      { suit: 'hearts', value: 9, label: '9' },
      { suit: 'diamonds', value: 4, label: '4' }
    ]
  },
  evaluation: { rank: 1, tieBreakers: [14, 12, 10, 8, 6] }
};

const pF = {
  player: {
    name: 'Player F',
    cards: [
      { suit: 'spades', value: 9, label: '9' },
      { suit: 'clubs', value: 4, label: '4' }
    ]
  },
  evaluation: { rank: 1, tieBreakers: [14, 12, 10, 8, 6] }
};

// Player F has Spades (4) on 9, Player E has Hearts (3) on 9
const result3 = PokerDeck.comparePlayerShowdown(pF, pE);
assert.strictEqual(result3, 1, 'Player F (Spades 9) should beat Player E (Hearts 9)');
console.log('✓ Case 3 Passed: Both card values identical (9 & 4), resolved by Spades > Hearts');

console.log('All showdown tiebreaker tests passed successfully!');
