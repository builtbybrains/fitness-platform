/* Cross-platform alert and confirm, Promise based.

   react-native-web's Alert.alert does nothing, so on web these use the
   browser's own alert/confirm; on iOS and Android they use Alert.alert.

     await showAlert('Photo check failed', message);
     if (await showConfirm({ title: 'Sign out', message: '…', confirmLabel: 'Sign out', destructive: true })) {
       await signOut();
     }
*/

import { Alert, Platform } from 'react-native';

type WebDialogs = { alert?: (m?: string) => void; confirm?: (m?: string) => boolean };

function web(): WebDialogs | null {
  return Platform.OS === 'web' ? (globalThis as unknown as WebDialogs) : null;
}

function joined(title: string, message?: string): string {
  return message ? `${title}\n\n${message}` : title;
}

/** Show a message with a single OK button. Resolves when it is dismissed. */
export function showAlert(title: string, message?: string, okLabel = 'OK'): Promise<void> {
  const w = web();
  if (w) {
    w.alert?.(joined(title, message));
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: okLabel, onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Label of the confirming button. Default "OK". */
  confirmLabel?: string;
  /** Label of the cancel button. Default "Cancel". */
  cancelLabel?: string;
  /** Style the confirming button as destructive (iOS shows it in red). */
  destructive?: boolean;
};

/** Ask a yes/no question. Resolves true only when the person confirms. */
export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  const w = web();
  if (w) return Promise.resolve(w.confirm ? w.confirm(joined(opts.title, opts.message)) : false);
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: opts.confirmLabel ?? 'OK',
          style: opts.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
