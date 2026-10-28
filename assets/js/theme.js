const LIGHT_CSS = "/assets/styles/main.css";
const DARK_CSS = "/assets//styles/main_dark.css";

const LOCAL_STORAGE_THEME_KEY = "theme";

const Theme = {
    Light: "Light",
    Dark: "Dark",
};

class ThemeManager {
    #currentTheme = Theme.Light;

    constructor(linkElement) {
        this.linkElement = linkElement;
    }

    get currentTheme() {
        return this.#currentTheme;
    }

    set currentTheme(theme) {
        this.#currentTheme = theme;
        this.linkElement.href = this.#getThemeCSS(this.#currentTheme);
    
        console.log("Theme set to " + this.#currentTheme);
    }

    #getThemeCSS(theme) {
        switch (theme) {
            case Theme.Light:
                return LIGHT_CSS;
            case Theme.Dark:
                return DARK_CSS;
            default:
                console.error("Invalid theme " + theme);
                return LIGHT_CSS;
        }
    }

    detectPreferredTheme() {
        const savedTheme = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
        if (savedTheme) {
            console.log("Found stored theme preferences in localStorage: " + savedTheme);
            this.currentTheme = savedTheme;
            return;
        }

        if (!window.matchMedia) {
            console.error("Browser does not suppor window.matchMedia");
            this.currentTheme = Theme.Light;
            return;
        }

        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            console.log("Detected preferred theme is dark");
            this.currentTheme = Theme.Dark;
        }
    }

    savePreferredTheme() {
        console.log("Saving theme preferences " + this.currentTheme);
        localStorage.setItem(LOCAL_STORAGE_THEME_KEY, this.currentTheme);
    }

}

window.onload = () => {
    const linkElement = document.getElementById("theme");
    const switcher = document.getElementById("switcher");

    const themeManager = new ThemeManager(linkElement);

    themeManager.detectPreferredTheme();
    
    switcher.checked = themeManager.currentTheme === Theme.Dark;

    switcher.addEventListener("change", (event) => {
        const isDark = event.currentTarget.checked;
        themeManager.currentTheme = isDark ? Theme.Dark : Theme.Light;
        
        themeManager.savePreferredTheme();
    });
};