import { TAILLES_PAGE } from './paginer';

const nb = (n) => Number(n).toLocaleString('fr-FR');

export default function Pagination({ page, pages, total, debut, nbAffiches, parPage, onPage, onParPage, occupe = false }) {
  if (!total) return null;
  const premiere = page === 0 || occupe;
  const derniere = page + 1 >= pages || occupe;
  return (
    <div className="pager">
      <button className="p" disabled={premiere} onClick={() => onPage(0)} title="Première page">«</button>
      <button className="p" disabled={premiere} onClick={() => onPage(page - 1)}>‹ Précédent</button>
      <span>
        {nb(debut + 1)}–{nb(debut + nbAffiches)} sur {nb(total)} · page {nb(page + 1)} / {nb(pages)}{occupe && ' …'}
      </span>
      <button className="p" disabled={derniere} onClick={() => onPage(page + 1)}>Suivant ›</button>
      <button className="p" disabled={derniere} onClick={() => onPage(pages - 1)} title="Dernière page">»</button>
      <label>
        Afficher{' '}
        <select className="cb" value={parPage} onChange={(e) => onParPage(Number(e.target.value))}>
          {TAILLES_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {' '}par page
      </label>
    </div>
  );
}
