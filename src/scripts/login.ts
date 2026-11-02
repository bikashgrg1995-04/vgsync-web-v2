
/* =========================================================
   VGSync Login Page Scripts
   ========================================================= */


/* =========================================================
   1. ELEMENT REFERENCES
   ========================================================= */

const root = document.documentElement;

// Theme elements
const themeToggle = document.querySelector<HTMLButtonElement>(
    '#theme-toggle',
);

const themeLabel = document.querySelector<HTMLElement>(
    '#theme-toggle-label',
);

const sunIcon = document.querySelector<SVGElement>(
    '#theme-sun-icon',
);

const moonIcon = document.querySelector<SVGElement>(
    '#theme-moon-icon',
);

// Password elements
const passwordInput = document.querySelector<HTMLInputElement>(
    '#password',
);

const passwordToggle = document.querySelector<HTMLButtonElement>(
    '#password-toggle',
);

// Login form elements
const loginForm = document.querySelector<HTMLFormElement>(
    '#login-form',
);

const forgotPasswordButton = document.querySelector<HTMLButtonElement>(
    '#forgot-password',
);

const formMessage = document.querySelector<HTMLElement>(
    '#form-message',
);


/* =========================================================
   2. THEME MANAGEMENT
   ========================================================= */

type Theme = 'dark' | 'light';

const getCurrentTheme = (): Theme => {
    return root.dataset.theme === 'light' ? 'light' : 'dark';
};


const updateThemeUI = (theme: Theme): void => {
    const isDark = theme === 'dark';

    // Update theme icons
    sunIcon?.classList.toggle('is-hidden', isDark);
    moonIcon?.classList.toggle('is-hidden', !isDark);

    // Update button label
    if (themeLabel) {
        themeLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
    }

    // Update accessibility label
    themeToggle?.setAttribute(
        'aria-label',
        isDark ? 'Switch to light mode' : 'Switch to dark mode',
    );
};


const setTheme = (theme: Theme): void => {
    root.dataset.theme = theme;

    updateThemeUI(theme);

    try {
        localStorage.setItem('vgsync-theme', theme);
    } catch {
        // Theme still works for the current page session.
    }
};


// Initialize theme UI using the theme loaded by Layout.astro
updateThemeUI(getCurrentTheme());


// Toggle theme
themeToggle?.addEventListener('click', () => {
    const currentTheme = getCurrentTheme();

    const nextTheme: Theme =
        currentTheme === 'dark' ? 'light' : 'dark';

    setTheme(nextTheme);
});


/* =========================================================
   3. PASSWORD VISIBILITY
   ========================================================= */

passwordToggle?.addEventListener('click', () => {
    if (!passwordInput) return;

    const isPasswordHidden = passwordInput.type === 'password';

    // Toggle input type
    passwordInput.type = isPasswordHidden ? 'text' : 'password';

    // Update accessibility state
    passwordToggle.setAttribute(
        'aria-label',
        isPasswordHidden ? 'Hide password' : 'Show password',
    );

    passwordToggle.setAttribute(
        'aria-pressed',
        String(isPasswordHidden),
    );

    // Keep the cursor at the end of the input
    passwordInput.focus();

    const inputLength = passwordInput.value.length;

    try {
        passwordInput.setSelectionRange(inputLength, inputLength);
    } catch {
        // Ignore unsupported input selection.
    }
});


/* =========================================================
   4. FORM MESSAGE
   ========================================================= */

type MessageType = 'error' | 'success' | 'info';


const showFormMessage = (
    message: string,
    type: MessageType = 'info',
): void => {
    if (!formMessage) return;

    formMessage.textContent = message;

    formMessage.classList.remove(
        'is-hidden',
        'is-error',
        'is-success',
        'is-visible',
    );

    formMessage.classList.add(
        'is-visible',
        `is-${type}`,
    );
};


const clearFormMessage = (): void => {
    if (!formMessage) return;

    formMessage.textContent = '';

    formMessage.classList.remove(
        'is-visible',
        'is-error',
        'is-success',
    );
};


/* =========================================================
   5. LOGIN FORM
   ========================================================= */

loginForm?.addEventListener('submit', (event: SubmitEvent) => {
    event.preventDefault();

    clearFormMessage();

    // Authentication API is not connected yet.
    showFormMessage(
        'Login service is not connected yet. Backend integration will be added next.',
        'info',
    );
});


/* =========================================================
   6. FORGOT PASSWORD
   ========================================================= */

forgotPasswordButton?.addEventListener('click', () => {
    clearFormMessage();

    showFormMessage(
        'Please contact your administrator to reset your password.',
        'info',
    );
});


/* =========================================================
   7. CLEAR MESSAGE WHEN USER STARTS TYPING
   ========================================================= */

loginForm?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    input.addEventListener('input', () => {
        clearFormMessage();
    });
});
