export const TAILLES_PAGE = [5, 10, 25, 50];
export const PAR_PAGE_DEFAUT = 5;

export function paginer(liste, page, parPage) {
  const pages = Math.max(1, Math.ceil(liste.length / parPage));
  const active = Math.min(page, pages - 1);
  const debut = active * parPage;
  return { page: active, pages, debut, visibles: liste.slice(debut, debut + parPage) };
}
