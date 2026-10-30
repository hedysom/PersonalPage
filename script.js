const toggleButton = document.getElementById('theme-toggle');
const root = document.documentElement;
const themeStatus = document.getElementById('theme-status');

if (toggleButton) {
    const updateToggle = () => {
        const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
        toggleButton.textContent = `${nextTheme === 'light' ? 'Light' : 'Dark'} theme`;
        toggleButton.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
    };

    updateToggle();
    toggleButton.hidden = false;

    toggleButton.addEventListener('click', () => {
        const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
        root.dataset.theme = theme;
        updateToggle();

        try {
            localStorage.setItem('theme', theme);
            if (themeStatus) themeStatus.textContent = `${theme === 'light' ? 'Light' : 'Dark'} theme selected.`;
        } catch (error) {
            console.warn('The theme changed, but the preference could not be saved.', error);
            if (themeStatus) themeStatus.textContent = 'Theme changed. Your browser prevented saving this preference.';
        }
    });
}
