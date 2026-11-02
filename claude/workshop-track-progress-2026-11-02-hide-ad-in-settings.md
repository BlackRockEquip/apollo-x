# Workshop Track - progress 2026-11-02: Hide the sidebar ad while Settings is open (pr36)

**Request:** "when clicking the settings menu item, let the ad be hidden, only when the settings menu is closed then the ad can be displayed"

- `components/AppShell.tsx`: `settingsOpen` = the Settings group's open state (same rule as the group itself: starts open on a settings page, a click opens / closes it for that page). `<SidebarAd />` is rendered only when Settings is closed (and not in a support session, as before).
- Effect: on any /settings page the ad is hidden by default; clicking Settings to close it brings the ad back; on other pages clicking Settings open hides it.
- Not browser-tested (type/syntax checked only; tsc noise in the sandbox comes from stale files). Push: `push/push-hide-ad-in-settings.ps1`. No migration.
