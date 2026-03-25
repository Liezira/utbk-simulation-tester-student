// --- HELPER FUNCTIONS ---

export const getQuestionDifficulty = (question, index) => {
  if (question.difficulty === 'hard') return 3;
  if (question.difficulty === 'medium') return 2;
  if ((index + 1) % 3 === 0) return 3;
  if ((index + 1) % 2 === 0) return 2;
  return 1;
};

export const getWeight = (difficultyLevel) => {
  switch (difficultyLevel) {
    case 3: return 2.0;
    case 2: return 1.5;
    default: return 1.0;
  }
};

export const formatTime = (s) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

export const applyFormat = (text, selStart, selEnd, format) => {
  const selected = text.substring(selStart, selEnd);
  if (!selected) return { text, cursor: selStart };
  const formatMap = {
    bold:        ['**', '**'],
    italic:      ['_', '_'],
    underline:   ['<u>', '</u>'],
    strike:      ['~~', '~~'],
    superscript: ['^(', ')'],
    subscript:   ['_(', ')'],
  };
  const fmt = formatMap[format];
  if (!fmt) return { text, cursor: selEnd };
  const [open, close] = fmt;
  return {
    text: text.substring(0, selStart) + open + selected + close + text.substring(selEnd),
    cursor: selEnd + open.length + close.length,
  };
};
