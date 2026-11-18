// Page aliases only. APIs, webhooks and published property addresses are stable.
export const platformRedirects = [
  ["/dashboard/properties/new", "/panou/proprietati/noua"],
  ["/dashboard/properties/:path*", "/panou/proprietati/:path*"],
  ["/dashboard/templates", "/panou/modele"],
  ["/dashboard/profile", "/panou/profil"],
  ["/dashboard/inquiries", "/panou/mesaje"],
  ["/dashboard/admin", "/panou/administrare"],
  ["/dashboard/video", "/panou/promovare"],
  ["/dashboard", "/panou"],
  ["/templates/:path*", "/modele/:path*"],
  ["/preview/:path*", "/previzualizare/:path*"],
  ["/login", "/autentificare"],
  ["/register", "/inregistrare"],
  ["/reset-password", "/resetare-parola"],
  ["/admin/properties/:path*", "/administrare/proprietati/:path*"],
  ["/p/:slug/print", "/p/:slug/tiparire"],
] as const;
