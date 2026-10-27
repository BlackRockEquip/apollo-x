import type { TabletCard } from "./tablet-model";

export function TabletPartCard({ card, disabled, canEdit, onOpen, onAction }: { card: TabletCard; disabled?: boolean; canEdit: boolean; onOpen: () => void; onAction: () => void }) {
  const action = card.action;
  return (
    <article className="jt-card">
      <button type="button" className="jt-card-top" onClick={onOpen} aria-label={`Details for ${card.partNumber}`}>
        <span className="jt-card-names">
          <span className="jt-card-pn">{card.partNumber}</span>
          <span className="jt-card-desc">{card.description || "No description"}</span>
        </span>
        <span className="jt-card-qty">{card.qtyLabel}</span>
      </button>
      <div className="jt-card-bottom">
        <div className="jt-card-state">
          <span className={`jt-pill ${card.tone}`}>{card.statusLabel}</span>
          <span className="jt-card-note">{card.note}</span>
        </div>
        {action && canEdit ? (
          <button type="button" className={`jt-action ${action.kind}`} disabled={disabled} onClick={onAction}>{action.label}</button>
        ) : null}
      </div>
    </article>
  );
}
