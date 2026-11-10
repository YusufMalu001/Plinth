export type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'hermes' | 'ai';

export type ToastAction = {
  label: string;
  onClick?: () => void;
  href?: string;
};

export type Toast = {
  id: string;
  title: string;
  message?: string;
  kind: ToastKind;
  duration: number;
  badge?: string;
  action?: ToastAction;
  secondaryAction?: ToastAction;
};

type Listener = (toast: Toast) => void;
const listeners = new Set<Listener>();

export function showToast(input: Omit<Toast, 'id' | 'duration'> & { duration?: number }) {
  const toast: Toast = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    duration: input.duration ?? 4500,
  };
  listeners.forEach((listener) => listener(toast));
  return toast.id;
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
