import { useMemo, useState } from 'react';
import Pagination from './Pagination';
import { PAR_PAGE_DEFAUT, paginer } from './paginer';

export default function PertesProfits({ rows, fmt, parseAr, onOpen }) {
  const [min, setMin] = useState('-1000');
  const [max, setMax] = useState('1000');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [parPage, setParPage] = useState(PAR_PAGE_DEFAUT);
  const [nature, setNature] = useState('perte');

  const lo = parseAr(min);
  const hi = parseAr(max);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows
      .filter((r) => r.solde !== 0
        && (lo === null || r.solde >= lo) && (hi === null || r.solde <= hi)
        && (!t || r.compte_client.toLowerCase().includes(t) || (r.nom_client || '').toLowerCase().includes(t)))
      .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
  }, [rows, lo, hi, q]);

  const t = useMemo(() => {
    const o = { pertes: 0, nPertes: 0, profits: 0, nProfits: 0 };
    list.forEach((r) => {
      if (r.solde > 0) { o.pertes += r.solde; o.nPertes++; } else { o.profits += -r.solde; o.nProfits++; }
    });
    return o;
  }, [list]);

  const liste = useMemo(() => list.filter((r) => (nature === 'perte' ? r.solde > 0 : r.solde < 0)), [list, nature]);
  const tot = useMemo(() => liste.reduce(
    (a, r) => ({ debit: a.debit + r.total_debit, credit: a.credit + r.total_credit, solde: a.solde + r.solde }),
    { debit: 0, credit: 0, solde: 0 },
  ), [liste]);
  const { page: p, pages, debut, visibles: visible } = paginer(liste, page, parPage);
  const choisir = (n) => { setNature(n); setPage(0); };
  const set = (fn) => (e) => { fn(e.target.value); setPage(0); };

  return (
    <div className="page">
      <div className="bar">
        <span>Solde entre</span>
        <input type="search" inputMode="decimal" value={min} onChange={set(setMin)}
               style={{ maxWidth: 140, minWidth: 100, flex: 'none' }} />
        <span>et</span>
        <input type="search" inputMode="decimal" value={max} onChange={set(setMax)}
               style={{ maxWidth: 140, minWidth: 100, flex: 'none' }} />
        <span>Ar</span>
        <input type="search" placeholder="Rechercher un compte ou un nom…" value={q} onChange={set(setQ)} />
      </div>

      <div className="kpis">
        <button className={`kpi ${nature === 'perte' ? 'on' : ''}`} onClick={() => choisir('perte')}>
          <small>Total des pertes (solde positif)</small><b className="montant-perte">{fmt(t.pertes)} Ar</b><small>{t.nPertes} compte(s)</small>
        </button>
        <button className={`kpi ${nature === 'profit' ? 'on' : ''}`} onClick={() => choisir('profit')}>
          <small>Total des profits (solde négatif)</small><b className="montant-profit">{fmt(t.profits)} Ar</b><small>{t.nProfits} compte(s)</small>
        </button>
        <div className="kpi">
          <small>{t.pertes >= t.profits ? 'Résultat net : perte' : 'Résultat net : profit'}</small>
          <b className={t.pertes >= t.profits ? 'montant-perte' : 'montant-profit'}>{fmt(Math.abs(t.pertes - t.profits))} Ar</b>
          <small>{list.length} compte(s)</small>
        </div>
      </div>

      <div className="bar">
        <button className={`p ${nature === 'perte' ? 'on' : ''}`} onClick={() => choisir('perte')}>Pertes ({t.nPertes})</button>
        <button className={`p ${nature === 'profit' ? 'on' : ''}`} onClick={() => choisir('profit')}>Profits ({t.nProfits})</button>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Compte client</th><th>Nom</th><th className="n">Débit</th><th className="n">Crédit</th>
              <th className="n">Solde</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.compte_client} className="c" onClick={() => onOpen(r)}>
                <td>{r.compte_client}</td>
                <td className="l" title={r.nom_client}>{r.nom_client}</td>
                <td className="n">{fmt(r.total_debit)}</td>
                <td className="n">{fmt(r.total_credit)}</td>
                <td className="n"><b>{fmt(r.solde)}</b></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={5}>{nature === 'perte' ? 'Aucune perte' : 'Aucun profit'} dans cet intervalle.</td></tr>}
          </tbody>
          {liste.length > 0 && (
            <tfoot>
              <tr className={`total-pp ${nature}`}>
                <td colSpan={2}>Total {nature === 'perte' ? 'des pertes' : 'des profits'} ({liste.length} compte(s))</td>
                <td className="n">{fmt(tot.debit)}</td>
                <td className="n">{fmt(tot.credit)}</td>
                <td className="n"><b>{fmt(tot.solde)}</b></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Pagination page={p} pages={pages} total={liste.length} debut={debut} nbAffiches={visible.length}
                  parPage={parPage} onPage={setPage} onParPage={(n) => { setParPage(n); setPage(0); }} />
    </div>
  );
}
