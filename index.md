---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: home
title: Home
---

<img src="/assets/images/pic.jpg" class="profile-pic" alt="A photo of me and my wife" />

Hello my name is Luca Bertozzi, I have a master degree in Theoretical Physics and I have always been passionate about
computers, programming, FOSS, information security and privacy.

This is the homepage of my blog where I try to post monthly on my projects with computers, malware, vulnerabilities and,
occasionaly, life in general.

Other than computers I like cooking, sailing and travelling.

You can also contact me on the following platforms:
- [lucabtz on GitHub](https://github.com/lucabtz)
- [@lucabtz_ on X](https://x.com/lucabtz_)
- [@lucabtz@infosec.exchange on the Fediverse](https://infosec.exchange/@lucabtz)
- lucabtz on Discord
- [lucabertozzi.pub@gmail.com](mailto:lucabertozzi.pub@gmail.com)
- [Luca Bertozzi on LinkedIn](https://www.linkedin.com/in/luca-bertozzi-47858a180/)
- [lucabtz on HackTheBox (I don't play this much right now)](https://app.hackthebox.com/profile/56458)


## Latest Blog Posts
{% for post in site.posts limit: 3 %}
- [{{ post.title }}]({{ post.url }})
{% endfor %}
