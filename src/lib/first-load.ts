/**
 * True for the first page opened right after signing in. Login leaves a note in
 * sessionStorage; it is read once here (and cleared), so the loading popup and
 * the data warm-up both know about it no matter which of them asks first.
 */
function readOnce(): boolean {
  try {
    if (sessionStorage.getItem('vg:welcome') !== '1') return false;
    sessionStorage.removeItem('vg:welcome');
    return true;
  } catch {
    return false;
  }
}

export const firstLoad: boolean = typeof window !== 'undefined' && readOnce();
