import { create } from 'zustand';

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastStore {
  toast: ToastState | null;
  showToast: (toast: ToastState) => void;
  hideToast: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: null }),
}));

export function showToast(message: string, type: ToastState['type'] = 'info', duration?: number) {
  useToastStore.getState().showToast({ message, type, duration });
}

export function showSuccess(message: string, duration?: number) {
  showToast(message, 'success', duration ?? 3000);
}

export function showError(message: string, duration?: number) {
  showToast(message, 'error', duration ?? 5000);
}
