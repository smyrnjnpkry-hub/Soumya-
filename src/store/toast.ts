import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Short confirmation at the bottom of the screen, optionally with an action such as Undo. */
export function toast(message: string, action?: Toast['action']) {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, action }] }));
  setTimeout(() => useToasts.getState().dismiss(id), action ? 6000 : 3500);
}
