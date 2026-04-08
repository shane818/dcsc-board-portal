// Organization-specific configuration driven by environment variables.
// Defaults are set for DCSC — the existing deployment needs no env changes.
// A second deployment (e.g. DC SCORES) sets VITE_ORG_* vars in Vercel.

export const org = {
  name:        import.meta.env.VITE_ORG_NAME         ?? 'DC Soccer Club',
  shortName:   import.meta.env.VITE_ORG_SHORT_NAME   ?? 'DCSC',
  tagline:     import.meta.env.VITE_ORG_TAGLINE       ?? 'Developing Character, Strengthening Community',
  founded:     import.meta.env.VITE_ORG_FOUNDED       ?? '1977',
  location:    import.meta.env.VITE_ORG_LOCATION      ?? 'Washington, DC',
  logoPath:    import.meta.env.VITE_ORG_LOGO_PATH     ?? '/dcsc-logo.png',
  faviconPath: import.meta.env.VITE_ORG_FAVICON_PATH  ?? '/favicon.svg',
  accentColor: import.meta.env.VITE_ORG_ACCENT_COLOR  ?? '#C41E3A',
}
