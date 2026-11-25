# SEO și Google Search Console

## Ce publică aplicația

- Prima pagină are titlul „Caută sau publică o locuință | Următoarea Proprietate”, o descriere pentru persoanele care caută proprietăți și pentru agenții și proprietarii care publică anunțuri, plus date structurate `Organization` și `WebSite`.
- Fiecare proprietate publicată primește automat metadate din datele ei. Titlul folosește denumirea anunțului, tipul, tranzacția și localitatea disponibilă. Descrierea include zona și caracteristicile care încap în fragmentul scurt, cum ar fi suprafața, dormitoarele, băile și prețul. Fotografia de copertă este disponibilă la distribuire. Datele structurate `RealEstateListing` descriu oferta și proprietatea din pagină.
- Rezultatele nefiltrate care au proprietăți sunt indexabile. Fiecare pagină numerotată are propriul URL canonic și linkuri HTML către celelalte pagini ale căutării. Rezultatele fără proprietăți și variantele personalizate cu buget sau monedă au `noindex`. Paginile de căutare și proprietățile au metadate generate pe server.
- Logo-ul platformei este disponibil în `<head>` pe toate paginile. `/favicon.ico` oferă dimensiuni de 16, 32, 48 și 96 px, iar `/icon.png` este o imagine pătrată de 96 px și `/icon.svg` este varianta vectorială.
- `robots.txt` declară indexul `/sitemap.xml`. Sitemap-urile copil conțin pagina principală, categorii cu rezultate și adresele curente ale proprietăților publicate. Actualizările se reflectă automat, cu un cache de până la cinci minute la Vercel. O întrerupere a bazei de date produce `503` pentru sitemap, semnalând că Google poate reîncerca.
- Adresele vechi ale proprietăților trimit într-un singur pas spre adresa actuală. Aceste adrese sunt excluse din sitemap. Google Search Console le poate raporta drept **Page with redirect** după ce le vede într-un link vechi sau în istoricul de accesare. Este o excludere normală pentru o adresă veche. Dacă apare același statut pentru un URL din sitemap, verifică răspunsul HTTP, adresa canonică și domeniul folosit în sitemap.
- Proprietățile inexistente sau retrase răspund `404`. Panoul, administrarea, previzualizările, modelele demonstrative și paginile de cont au `noindex`. Deploy-urile Vercel Preview au indexarea dezactivată.

## Verificare după publicarea în producție

1. În proiectul Vercel `pucioasa-premium`, verifică domeniul primar `https://urmatoarea-proprietate.ro` și redirecționarea către acesta a aliasurilor `www` și `vercel.app` configurate ca publice. `NEXT_PUBLIC_SITE_URL` trebuie să folosească domeniul primar sau să fie lăsată liberă pentru valoarea implicită din aplicație.
2. În proprietatea **Domain** deja verificată din Google Search Console, păstrează `https://urmatoarea-proprietate.ro/sitemap.xml` ca sitemap trimis. Google descoperă sitemap-urile copil. Instalarea curentă a activat deja RPC-urile de sitemap și căutare, iar actualizarea acestor metadate folosește schema existentă din Supabase.
3. În **URL Inspection**, testează pagina principală și un anunț publicat recent. Verifică accesul Googlebot și faptul că adresa canonică declarată este adresa finală. Solicită indexarea dacă este nevoie de o recrawl pentru noile metadate. Verifică **Page indexing** pentru URL-urile trimise și **Core Web Vitals** pentru datele de la utilizatori reali.

Sitemap-ul ajută Google să găsească paginile publicate. Timpul de indexare, titlul și descrierea afișate, faviconul și poziția în căutare sunt decise de Google.

## Referințe tehnice

- [Google Search Central — titluri în rezultatele căutării](https://developers.google.com/search/docs/appearance/title-link)
- [Google Search Central — fragmente și descrieri](https://developers.google.com/search/docs/appearance/snippet)
- [Google Search Central — favicon](https://developers.google.com/search/docs/appearance/favicon-in-search)
- [Google Search Central — adrese canonice](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Central — paginare](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [Google Search Central — sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Search Console — raportul de indexare](https://support.google.com/webmasters/answer/7440203)

`tests/seo.test.ts` și `tests/connected/seo.spec.ts` verifică metadatele, sitemap-ul, adresele canonice, paginarea, faviconul, răspunsurile 307 și 404 și excluderea paginilor de cont și administrare. Testele din depozit folosesc o bază simulată. Inspecția URL și datele Search Console verifică instalarea de producție.
