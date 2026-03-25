// --- CONFIGURATION ---
export const SUBTEST_GROUPS = {
  TPS: { title: "Tes Potensi Skolastik (TPS)", ids: ['pu', 'ppu', 'pbm', 'pk'], color: "#3b82f6" },
  LITERASI: { title: "Tes Literasi & Penalaran", ids: ['lbi', 'lbe', 'pm'], color: "#f97316" }
};

export const SUBTESTS = [
  { id: 'pu',  name: 'Penalaran Umum',                    questions: 30, time: 30 },
  { id: 'ppu', name: 'Pengetahuan & Pemahaman Umum',       questions: 20, time: 15 },
  { id: 'pbm', name: 'Pemahaman Bacaan & Menulis',         questions: 20, time: 25 },
  { id: 'pk',  name: 'Pengetahuan Kuantitatif',            questions: 20, time: 20 },
  { id: 'lbi', name: 'Literasi Bahasa Indonesia',          questions: 30, time: 45 },
  { id: 'lbe', name: 'Literasi Bahasa Inggris',            questions: 20, time: 30 },
  { id: 'pm',  name: 'Penalaran Matematika',               questions: 20, time: 30 },
];

// Sistem Skoring Pelanggaran (Sinkron dengan Admin Config)
export const VIOLATION_SCORING = {
  types: {
    tab_switch:   { label: 'Pindah Tab/Window',  deduction: 2,  maxCount: 3,  grace: 1 },
    fullscreen:   { label: 'Keluar Fullscreen',  deduction: 1,  maxCount: 5,  grace: 2 },
    copy_paste:   { label: 'Copy/Paste',         deduction: 3,  maxCount: 2,  grace: 0 },
    devtools:     { label: 'Buka DevTools',      deduction: 5,  maxCount: 1,  grace: 0 },
    split_screen: { label: 'Split Screen',       deduction: 3,  maxCount: 2,  grace: 0 },
  },
  maxTotalDeduction: 15,   // Auto-submit threshold
  warningThreshold: 8,     // Peringatan keras muncul
};

// Map tipe internal ke kategori scoring
export const VIOLATION_TYPE_MAP = {
  visibility:      'tab_switch',
  blur:            'tab_switch',
  screenshot:      'tab_switch',
  fullscreen_exit: 'fullscreen',
  split_screen_h:  'split_screen',
  split_screen_w:  'split_screen',
  devtools:        'devtools',
  copy:            'copy_paste',
  paste:           'copy_paste',
  rightClick:      null, // Tidak ada pengurangan, hanya diblok
};

export const SECURITY_CONFIG = {
  MAX_VIOLATIONS: 2, // Tetap untuk SP modal (legacy)
  PASTE_BLOCKED: true,
  COPY_BLOCKED: true,
  DEVTOOLS_BLOCKED: true,
  RIGHT_CLICK_BLOCKED: true,
  FULLSCREEN_EXIT_GRACE_PERIOD: 2000,
};

// Pause Config
export const PAUSE_CONFIG = {
  MAX_PAUSE_COUNT: 2,      // Maksimal pause per subtes
  MAX_PAUSE_DURATION: 300, // Detik (5 menit) per pause
};
