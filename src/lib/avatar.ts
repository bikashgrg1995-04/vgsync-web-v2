/**
 * Demo profile avatar storage (per user).
 * Later: replace with Django media upload + CDN URL.
 */

const AVATAR_PREFIX = 'vgsync-avatar:';
const MAX_BYTES = 800_000; // ~0.8MB after base64 is larger; we limit file before encode
const MAX_FILE = 512 * 1024; // 512KB raw file

export function avatarKey(userId: string): string {
  return `${AVATAR_PREFIX}${userId}`;
}

export function getAvatar(userId: string): string | null {
  try {
    return localStorage.getItem(avatarKey(userId));
  } catch {
    return null;
  }
}

export function clearAvatar(userId: string): void {
  try {
    localStorage.removeItem(avatarKey(userId));
  } catch {
    // ignore
  }
}

export function setAvatarFromFile(
  userId: string,
  file: File,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve({ ok: false, error: 'Please choose an image file (JPG, PNG, WebP).' });
      return;
    }
    if (file.size > MAX_FILE) {
      resolve({ ok: false, error: 'Image must be under 512 KB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) {
        resolve({ ok: false, error: 'Invalid image data.' });
        return;
      }
      if (dataUrl.length > MAX_BYTES) {
        resolve({ ok: false, error: 'Image is too large after processing.' });
        return;
      }
      try {
        localStorage.setItem(avatarKey(userId), dataUrl);
      } catch {
        resolve({ ok: false, error: 'Could not save image on this device.' });
        return;
      }
      resolve({ ok: true, dataUrl });
    };
    reader.onerror = () => resolve({ ok: false, error: 'Failed to read the file.' });
    reader.readAsDataURL(file);
  });
}

/** Apply avatar image or initials into an element */
export function paintAvatar(
  el: HTMLElement | null,
  userId: string,
  displayName: string,
): void {
  if (!el) return;
  const url = getAvatar(userId);
  if (url) {
    el.classList.add('has-photo');
    el.style.backgroundImage = `url("${url}")`;
    el.textContent = '';
  } else {
    el.classList.remove('has-photo');
    el.style.backgroundImage = '';
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    let initials = 'U';
    if (parts.length === 1) initials = parts[0].slice(0, 2).toUpperCase();
    else if (parts.length > 1) initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    el.textContent = initials;
  }
}
