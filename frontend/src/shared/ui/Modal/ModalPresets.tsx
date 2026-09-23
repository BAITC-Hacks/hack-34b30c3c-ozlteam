import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "../Button/Button";
import type { ButtonVariant } from "../Button/Button";
import { Modal } from "./Modal";
import type { ModalProps } from "./Modal";
import { useModalStack } from "./modal-stack";

type PresetModalProps = Omit<ModalProps, "children" | "footer">;

export interface ConfirmModalProps extends PresetModalProps {
  children: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  confirmVariant?: ButtonVariant;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({
  id,
  children,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  confirmVariant = "primary",
  pending: externalPending = false,
  onConfirm,
  open,
  ...modalProps
}: ConfirmModalProps) {
  const stack = useModalStack();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) setPending(false);
  }, [open]);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      stack.close(id);
    } finally {
      setPending(false);
    }
  }

  const isPending = pending || externalPending;

  return (
    <Modal
      {...modalProps}
      id={id}
      open={open}
      footer={
        <>
          <Button variant="secondary" disabled={isPending} onClick={() => stack.close(id)}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} loading={isPending} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export interface FormModalProps extends PresetModalProps {
  children: ReactNode;
  submitLabel?: ReactNode;
  cancelLabel?: ReactNode;
  pending?: boolean;
  onSubmit: () => void | Promise<void>;
}

export function FormModal({
  id,
  children,
  submitLabel = "Сохранить",
  cancelLabel = "Отмена",
  pending: externalPending = false,
  onSubmit,
  open,
  ...modalProps
}: FormModalProps) {
  const stack = useModalStack();
  const formId = `modal-form-${useId().replaceAll(":", "")}`;
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) setPending(false);
  }, [open]);

  async function handleSubmit() {
    setPending(true);
    try {
      await onSubmit();
      stack.close(id);
    } finally {
      setPending(false);
    }
  }

  const isPending = pending || externalPending;

  return (
    <Modal
      {...modalProps}
      id={id}
      open={open}
      footer={
        <>
          <Button variant="secondary" disabled={isPending} onClick={() => stack.close(id)}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} loading={isPending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {children}
      </form>
    </Modal>
  );
}
