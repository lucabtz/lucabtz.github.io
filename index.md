---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: home
title: Home
---

<img src="/assets/images/pic.jpg" class="profile-pic" alt="A photo of me and my wife" />

Hello my name is Luca Bertozzi, I have a master degree in Theoretical Physics, but I have always been passionate about
computers and have been coding since a long time now: thus I am now switching and going into cybersecurity.

This blog will mainly be on cybersecurity topics however I may occasionally talk about Computer Science,
Physics or Science in general. I hope you will find interesting reads in here.

You can also contact me on the following platforms:
- [GitHub](https://github.com/lucabtz)
- [X](https://x.com/lucabtz_)
- Discord handle: lucabtz
- [lucabertozzi.pub@gmail.com](mailto:lucabertozzi.pub@gmail.com)


<h2>Latest Blog Posts</h2>
<ul>
    {% for post in site.posts limit: 3 %}
    <li><a href="{{ post.url }}">{{ post.title }}</a></li>
    {% endfor %}
</ul>