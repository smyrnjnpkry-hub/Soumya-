import { create } from 'zustand';

/** Chromium's install prompt event (not yet in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  promptEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  install: () => Promise<void>;
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const useInstall = create<InstallState>()((set, get) => ({
  promptEvent: null,
  installed: standalone(),
  install: async () => {
    const event = get().promptEvent;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    set({ promptEvent: null, installed: outcome === 'accepted' });
  },
}));

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  useInstall.setState({ promptEvent: e as BeforeInstallPromptEvent });
});
window.addEventListener('appinstalled', () => useInstall.setState({ promptEvent: null, installed: true }));

/** iPhone/iPad Safari has no install prompt; users add to Home Screen from the Share menu. */
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
