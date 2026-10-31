const IGNORE = ['the', 'and', 'for', 'with', 'from', 'this', 'that', 'item', 'items', 'piece', 'pieces', 'some', 'any', 'our', 'your', 'fresh', 
    'baked', 'sliced', 'whole', 'pack', 'packs', 'box', 'boxes', 'assorted', 'mixed', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekend', 'week'
];

const WORD_GROUPS = [
    ['bread', 'loaf', 'loaves', 'sourdough', 'bun', 'roll', 'baguette', 'toast'],
    ['pastry', 'pastries', 'croissant', 'tart', 'puff', 'danish', 'muffin', 'cake', 'cookie', 'donut', 'doughnut']
];


function simplifyWord(word) {
    if (word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
  }
  return word;
}

function getWords(text) {
    text = String(text).toLowerCase();
    let words = text.split(' ');
    let result = [];
    
    for (let word of words) {
        word = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
        if (word.length < 3 || IGNORE.includes(word)) {
            continue;
        }
        
        word = simplifyWord(word);
        result.push(word);
    }
    return result;
}

export function needMatches(need, listing) {
    const requiredTags = need.dietaryTags || [];
    const availableTags = listing.dietaryTags || [];
    for (let tag of requiredTags) {
        if (!availableTags.includes(tag)) {
            return false;
    }}
    
    const wantedWords = getWords(need.title);
    const offeredWords = getWords(listing.itemName);

    for (let word of wantedWords) {
        if (offeredWords.includes(word)) {
            return true;
        }}
    
    for (let group of WORD_GROUPS) {
        let needMatchesGroup = false;
        let listingMatchesGroup = false;

    for (let word of wantedWords) {
        if (group.includes(word)) {
            needMatchesGroup = true;
        }}

    for (let word of offeredWords) {
        if (group.includes(word)) {
            listingMatchesGroup = true;
        }}

    if (needMatchesGroup && listingMatchesGroup) {
        return true;
        }}

  return false;
}