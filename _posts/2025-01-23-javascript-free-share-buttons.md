---
title: JavaScript-free Share Buttons
description: Continuation of the previous post. I use the built arbitrary call primitive using some blind format string exploitation techniques to achieve RCE.
tags: meta
---

Hello and welcome back to my blog! Before diving in the post's topic I want to say sorry for not posting last month: I had
a series of inconveniences during December, including getting Dengue fever and moving back to my home country, Italy, from the
Philippines. Also I excuse myself, but this blog post is not on security.

Anyhow I like to have share buttons for various social medias on my blog posts, but the default share buttons for X and LinkedIn
use JavaScript. Not only that but the X button appears to be particularly slow to load. I have noticed this on my website and some
other websites as well: it may be a mistake on my side, though.

The thing that bugs me about this share buttons is that they need some JavaScript embedded in the page. While I haven't reversed the
code to understand what it does, I think it is completely useless to have such code in the first place (I *guess* it may be do some
analytics related stuff, which I don't care about). All the button have to do is redirect the user to a certain page. Also some privacy 
concerned user might have JS disabled (think TOR Browser for example) which would cause the buttons to not work (maybe not so important 
because a privacy concerned user may not want to share what they are reading in the first place, but still).

So anyhow I want to share how you can implement share buttons for Mastodon, BlueSky, X and LinkedIn without a line of JS.
The structure of all the buttons will be the following
```html
<a class="share share-[social media name]" target="_blank" title="Share on [social media name]"
    href="[statically generated share link]">
    <svg></svg>
    <div>[Text]</div>
</a>
```
All the links are statically generated using Jekyll's templating language.

The `share` CSS class handles the general layout of the button, note that I'm using SASS
```scss
a.share {
    border-radius: 0.2em;
    height: 21px;
    text-decoration: none;

    display: flex;
    flex-direction: row;
    align-items: center;

    padding-left: 5px;
    padding-right: 5px;

    svg {
        height: 15px;
        width: 15px;
        margin-right: 3px;
    }

    div {
        font-size: 15px;
        font-family: Helvetica, Arial, sans-serif;
    }
}
```

## Mastodon
I used the service [Mastodon Share](https://mastodonshare.com){:target="_blank"} to implement the share button. The code
follows
```html
{% raw %}
<a href="https://mastodonshare.com/?text={{ page.title }}&url={{ site.url }}{{ page.url }}"
    class="share share-mastodon" target="_blank" title="Share on Mastodon">
    <svg width="74" height="79" viewBox="0 0 74 79" fill="black"
        xmlns="http://www.w3.org/2000/svg">
        <path
            d="M73.7014 17.4323C72.5616 9.05152 65.1774 2.4469 56.424 1.1671C54.9472 0.950843 49.3518 0.163818 36.3901 0.163818H36.2933C23.3281 0.163818 20.5465 0.950843 19.0697 1.1671C10.56 2.41145 2.78877 8.34604 0.903306 16.826C-0.00357854 21.0022 -0.100361 25.6322 0.068112 29.8793C0.308275 35.9699 0.354874 42.0498 0.91406 48.1156C1.30064 52.1448 1.97502 56.1419 2.93215 60.0769C4.72441 67.3445 11.9795 73.3925 19.0876 75.86C26.6979 78.4332 34.8821 78.8603 42.724 77.0937C43.5866 76.8952 44.4398 76.6647 45.2833 76.4024C47.1867 75.8033 49.4199 75.1332 51.0616 73.9562C51.0841 73.9397 51.1026 73.9184 51.1156 73.8938C51.1286 73.8693 51.1359 73.8421 51.1368 73.8144V67.9366C51.1364 67.9107 51.1302 67.8852 51.1186 67.862C51.1069 67.8388 51.0902 67.8184 51.0695 67.8025C51.0489 67.7865 51.0249 67.7753 50.9994 67.7696C50.9738 67.764 50.9473 67.7641 50.9218 67.7699C45.8976 68.9569 40.7491 69.5519 35.5836 69.5425C26.694 69.5425 24.3031 65.3699 23.6184 63.6327C23.0681 62.1314 22.7186 60.5654 22.5789 58.9744C22.5775 58.9477 22.5825 58.921 22.5934 58.8965C22.6043 58.8721 22.621 58.8505 22.6419 58.8336C22.6629 58.8167 22.6876 58.8049 22.714 58.7992C22.7404 58.7934 22.7678 58.794 22.794 58.8007C27.7345 59.9796 32.799 60.5746 37.8813 60.5733C39.1036 60.5733 40.3223 60.5733 41.5447 60.5414C46.6562 60.3996 52.0437 60.1408 57.0728 59.1694C57.1983 59.1446 57.3237 59.1233 57.4313 59.0914C65.3638 57.5847 72.9128 52.8555 73.6799 40.8799C73.7086 40.4084 73.7803 35.9415 73.7803 35.4523C73.7839 33.7896 74.3216 23.6576 73.7014 17.4323ZM61.4925 47.3144H53.1514V27.107C53.1514 22.8528 51.3591 20.6832 47.7136 20.6832C43.7061 20.6832 41.6988 23.2499 41.6988 28.3194V39.3803H33.4078V28.3194C33.4078 23.2499 31.3969 20.6832 27.3894 20.6832C23.7654 20.6832 21.9552 22.8528 21.9516 27.107V47.3144H13.6176V26.4937C13.6176 22.2395 14.7157 18.8598 16.9118 16.3545C19.1772 13.8552 22.1488 12.5719 25.8373 12.5719C30.1064 12.5719 33.3325 14.1955 35.4832 17.4394L37.5587 20.8853L39.6377 17.4394C41.7884 14.1955 45.0145 12.5719 49.2765 12.5719C52.9614 12.5719 55.9329 13.8552 58.2055 16.3545C60.4017 18.8574 61.4997 22.2371 61.4997 26.4937L61.4925 47.3144Z"
            fill="inherit" />
    </svg>
    <div>Toot</div>
</a>
{% endraw %}
```
And for the style:
```scss
a.share-mastodon {
    background: #2b90d9;

    svg {
        fill: white;
    }

    div {
        color: white;
    }
}
```

## BlueSky
For BlueSky we don't need a specific service for sharing. My first inspiration for the code was [this blog post](https://www.pietschsoft.com/post/2024/11/22/how-to-add-share-on-bluesky-action-intent-button-to-your-website){:target="_blank"}
```html
{% raw %}
<a class="share share-bluesky" target="_blank" title="Share on Bluesky"
    href="https://bsky.app/intent/compose?text={{ site.url }}{{ page.url }}">
    <svg width="1em" height="1em" fill="inherit" viewBox="0 0 600 530"
        xmlns="http://www.w3.org/2000/svg">
        <path
            d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
    </svg>
    <div>Skeet</div>
</a>
{% endraw %}
```
And the style:
```scss
a.share-bluesky {
    background: #1185fe;

    svg {
        fill: white;
    }

    div {
        color: white;
    }
}
```

## X
Okay let me first be clear: I don't like X's owner. However there are still a lot of interesting people which have not moved to
Mastodon or BlueSky so I'm still there. Also there I often find interesting posts on security, so I think "boycotting X by not
having an X share button" would only hurt me, rather than X.
The HTML:
```html
{% raw %}
<a class="share share-x" target="_blank" title="Share on X"
    href="https://x.com/intent/post?original_referer={{ site.url }}%2F&text={{ page.title }}&url={{ site.url }}{{ page.url }}">
    <svg width="1200" height="1227" viewBox="0 0 1200 1227" fill="inherit"
        xmlns="http://www.w3.org/2000/svg">
        <path
            d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"
            fill="white" />
    </svg>
    <div>Post</div>
</a>
{% endraw %}
```
The style of course involes the "fascist black" color:
```scss
a.share-x {
    background: black;

    svg {
        fill: white;
    }

    div {
        color: white;
    }
}
```

## LinkedIn
The HTML code:
```html
{% raw %}
<a class="share share-linkedin" target="_blank" title="Share on LinkedIn"
    href="https://www.linkedin.com/feed/?linkOrigin=LI_BADGE&shareActive=true&shareUrl={{ site.url }}{{ page.url }}">
    <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100"
        viewBox="0 0 50 50" fill="inherit">
        <path
            d="M41,4H9C6.24,4,4,6.24,4,9v32c0,2.76,2.24,5,5,5h32c2.76,0,5-2.24,5-5V9C46,6.24,43.76,4,41,4z M17,20v19h-6V20H17z M11,14.47c0-1.4,1.2-2.47,3-2.47s2.93,1.07,3,2.47c0,1.4-1.12,2.53-3,2.53C12.2,17,11,15.87,11,14.47z M39,39h-6c0,0,0-9.26,0-10 c0-2-1-4-3.5-4.04h-0.08C27,24.96,26,27.02,26,29c0,0.91,0,10,0,10h-6V20h6v2.56c0,0,1.93-2.56,5.81-2.56 c3.97,0,7.19,2.73,7.19,8.26V39z">
        </path>
    </svg>
    <div>Share</div>
</a>
{% endraw %}
```
And the style:
```scss
a.share-linkedin {
    background: #0a66c2;

    svg {
        fill: white;
    }

    div {
        color: white;
    }
}
```

## Conclusion
This was a short blog post to share this code snippets which allow you to have share buttons which do not involve any JavaScript.
You are free to embed them on your blog, no need to credit me, however if you do I'd love if you'd let me know: you find my contacts
on my homepage.