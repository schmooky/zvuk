---
'@schmooky/zvuk': patch
---

Fix a context that starts in a hidden tab playing until the tab is shown and
hidden again.

`autoPauseOnHidden` suspends the context on `visibilitychange`, and that event
fires only when the tab changes. A tab opened in the background, where the
browser allows autoplay, starts its context without ever being seen, so nothing
paused it: sound played in a tab the player had not looked at, until they
showed it and hid it again.

The context is now paused on the way in, as a hide would pause it: when it is
created, and again when `unlock()` resumes it. The tab's return resumes it as
before. With `autoPauseOnHidden: false` nothing changes.
