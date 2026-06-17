import { Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"

export function WebMobileNav(props: {
  opened: () => boolean
  onClose: () => void
  children: JSX.Element
}) {
  const language = useLanguage()

  return (
    <div class="web-mobile-nav lg:hidden">
      <div
        data-component="web-mobile-nav-overlay"
        classList={{
          "fixed inset-x-0 bottom-0 z-40 bg-v2-overlay-simple-overlay-scrim/40 transition-opacity duration-200": true,
          "opacity-100 pointer-events-auto": props.opened(),
          "opacity-0 pointer-events-none": !props.opened(),
        }}
        style={{ top: "var(--app-titlebar-height, 2.25rem)" }}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose()
        }}
      />
      <nav
        aria-label={language.t("sidebar.nav.projectsAndSessions")}
        data-component="web-mobile-nav-panel"
        classList={{
          "@container fixed bottom-0 left-0 z-50 flex h-auto w-full max-w-[min(400px,100vw)] flex-col overflow-hidden border-r border-v2-border-border-muted bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)] transition-transform duration-200 ease-out": true,
          "translate-x-0": props.opened(),
          "-translate-x-full": !props.opened(),
        }}
        style={{ top: "var(--app-titlebar-height, 2.25rem)" }}
        onClick={(event) => event.stopPropagation()}
      >
        {props.children}
      </nav>
    </div>
  )
}
