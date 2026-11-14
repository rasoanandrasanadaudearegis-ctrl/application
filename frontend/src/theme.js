const KEY = 'rcc_theme';

export const getTheme = () => {
  try { return localStorage.getItem(KEY) || 'clair'; } catch { return 'clair'; }
};

export const applyTheme = (t) => {
  const r = document.documentElement;
  if (t === 'sombre') r.dataset.theme = 'dark';
  else if (t === 'clair') r.dataset.theme = 'light';
  else delete r.dataset.theme;
};

export const setTheme = (t) => {
  try { localStorage.setItem(KEY, t); } catch { }
  applyTheme(t);
};
