import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const pile = [];

export function Modale({ titre, sousTitre, actions, pied, taille = '', fermable = true, role = 'dialog', onClose, children }) {
  const id = useId();
  const appuiSurFond = useRef(false);

  useEffect(() => {
    pile.push(id);
    document.body.classList.add('modale-ouverte');
    return () => {
      pile.splice(pile.indexOf(id), 1);
      if (!pile.length) document.body.classList.remove('modale-ouverte');
    };
  }, [id]);

  useEffect(() => {
    if (!fermable) return undefined;
    const touche = (e) => { if (e.key === 'Escape' && pile[pile.length - 1] === id) onClose(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [id, fermable, onClose]);

  const fond = {
    onMouseDown: (e) => { appuiSurFond.current = e.target === e.currentTarget; },
    onClick: (e) => { if (fermable && appuiSurFond.current && e.target === e.currentTarget) onClose(); },
  };

  return createPortal(
    <div className="modal" {...fond}>
      <div className={`panel ${taille}`} role={role} aria-modal="true" aria-labelledby={`${id}-titre`}>
        <div className="modale-tete">
          <div className="modale-titres">
            <h2 id={`${id}-titre`}>{titre}</h2>
            {sousTitre && <div className="modale-sous">{sousTitre}</div>}
          </div>
          {actions && <div className="modale-actions">{actions}</div>}
          {fermable && <button type="button" className="modale-x" aria-label="Fermer" title="Fermer" onClick={onClose}>×</button>}
        </div>
        <div className="modale-corps">{children}</div>
        {pied && <div className="modale-pied">{pied}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirmation({
  titre, sousTitre, alerte, libelle = 'Supprimer', libelleOccupe = 'Suppression…', danger = true, occupe = false,
  onConfirmer, onAnnuler, children,
}) {
  return (
    <Modale titre={titre} sousTitre={sousTitre} taille="etroite" role="alertdialog" fermable={!occupe} onClose={onAnnuler}
            pied={(
              <>
                <button type="button" className="p" disabled={occupe} onClick={onAnnuler} autoFocus>Annuler</button>
                <button type="button" className={`p ${danger ? 'danger' : 'on'}`} disabled={occupe} onClick={onConfirmer}>
                  {occupe ? libelleOccupe : libelle}
                </button>
              </>
            )}>
      {children}
      {alerte && <p className="confirm-alerte">{alerte}</p>}
    </Modale>
  );
}
