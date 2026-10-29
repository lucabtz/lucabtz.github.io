---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: page
title: Home
---

<img src="/assets/images/pic.jpg" class="profile-pic" alt="A photo of me and my wife" />

{{ site.description | escape }}

## Contacts
You can also contact me on the following platforms:
- [{{ site.email }}](mailto:{{ site.email }})
- [{{ site.github_username }} on GitHub](https://github.com/{{ site.github_username }})
- [@lucabtz.com on BlueSky](https://bsky.app/profile/lucabtz.com)
- lucabtz on Discord
- [Luca Bertozzi on LinkedIn](https://www.linkedin.com/in/luca-bertozzi-47858a180/)

## Latest Blog Posts
{% for post in site.posts limit: 3 %}
- [{{ post.title | escape }}]({{ post.url }})
{% endfor %}
