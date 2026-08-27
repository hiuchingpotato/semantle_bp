import Modal from "./Modal";

type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A yes/no question.
 *
 * Cancel is the primary button and takes focus, because the destructive answer
 * should never be the one a stray Return key selects.
 */
export default function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal titleId="confirm-title" onClose={onCancel} className="modal-confirm">
      <h2 id="confirm-title" className="modal-title modal-title-plain">
        {title}
      </h2>
      <p className="modal-confirm-body">{body}</p>

      <div className="modal-actions">
        <button type="button" className="button-primary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="button-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
