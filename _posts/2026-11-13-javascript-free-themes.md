---
title: JavaScript-free Themes
description: I show how I implemented the theme system on this site with no JS
tags: meta
---

Hello and welcome back to the blog! It has been a long time since last post, however let's go straight to today's topic.
This blog has had a light and dark theme since a long time, however the system used to use JavaScript until now. I am in favor
of a simple web with little to no JavaScript and it didn't feel right to use JS for something like a theme system.

At the core the way this works is simple, we use a checkbox as control
```html
<input type="checkbox" id="switcher">
<label for="switcher"></label>
```
Then the following CSS drives it
```scss
$switcher-text-light: "💡On";
$switcher-text-dark: "💡Off";

:root {
    color-scheme: light;
}

:root:has(#switcher:checked) {
    color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
    :root {
        color-scheme: dark;
    }
    
    :root:has(#switcher:checked) {
        color-scheme: light;
    }
}

#switcher {
    display: none;

    & ~ label::before {
        content: $switcher-text-dark;
        color: $link-color;
        text-decoration: underline;
    }
    
    &:checked ~ label::before {
        content: $switcher-text-light;
    }

    @media (prefers-color-scheme: dark) {
        
        & ~ label::before {
            content: $switcher-text-light;
        }
        
        &:checked ~ label::before {
            content: $switcher-text-dark;
        }
    }
}
```
First of all, the logic is duplicated depending on the system's preferred theme, using the media query for `prefers-color-scheme`.
This is needed because I want the default theme applied to be the one the site loads first. By clicking the checkbox it is then
possible to switch to the other theme. The CSS `content` property is used to have the checkbox change depending on the state. Colors are switched using the `light-dark` function.

## Conclusion
This was just a short post to describe this technique. It is nothing novel, but I believed it was worth sharing.
The only downside is that the theme does not persist across page changes or refreshes.