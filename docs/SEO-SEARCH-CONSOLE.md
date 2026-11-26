# SEO și Google Search Console

## Ce publică aplicația

- Prima pagină are titlul „Caută sau publică o locuință | Următoarea Proprietate”, o descriere pentru persoanele care caută proprietăți și pentru agenții și proprietarii care publică anunțuri, plus date structurate `Organization` și `WebSite`.
- Fiecare proprietate publicată primește automat metadate din datele ei. Titlul începe cu tipul și tranzacția, apoi indică zona sau localitatea, urmată de adresa salvată. Descrierea începe cu „Cauți…?” și invită la o vizionare. Cartierul este folosit când este menționat în adresă. Fotografia de copertă este disponibilă la distribuire. Datele structurate `RealEstateListing` descriu oferta și proprietatea din pagină.
- Rezultatele nefiltrate care au proprietăți sunt indexabile. Fiecare pagină numerotată are propriul URL canonic și linkuri HTML către celelalte pagini ale căutării. Rezultatele fără proprietăți și variantele personalizate cu buget sau monedă au `noindex`. Paginile de căutare și proprietățile au metadate generate pe server.
- Toate paginile declară același favicon de 96 × 96 px în `<head>`, la adresa stabilă `/icon.png`. Logo-ul vectorial este disponibil la `/icon.svg`, iar `/favicon.ico` păstrează dimensiunile de 16, 32, 48 și 96 px pentru compatibilitate.
- `robots.txt` declară indexul `/sitemap.xml` și harta paginii principale la `/sitemap.xml/main.xml`. A doua este accesibilă și când baza de date este temporar indisponibilă. Sitemap-urile copil conțin pagina principală, categorii cu rezultate și adresele curente ale proprietăților publicate. Actualizările se reflectă automat, cu un cache de până la cinci minute la Vercel. Dacă baza de date este indisponibilă, sitemap-urile care depind de ea răspund cu `503`, ca Google să reîncerce.
- Adresele vechi ale proprietăților trimit într-un singur pas spre adresa actuală. Aceste adrese sunt excluse din sitemap. Google Search Console le poate raporta drept **Page with redirect** după ce le vede într-un link vechi sau în istoricul de accesare. Este o excludere normală pentru o adresă veche. Dacă apare același statut pentru un URL din sitemap, verifică răspunsul HTTP, adresa canonică și domeniul folosit în sitemap.
- Proprietățile inexistente sau retrase răspund `404`. Panoul, administrarea, previzualizările, modelele demonstrative și paginile de cont au `noindex`. Deploy-urile Vercel Preview au indexarea dezactivată.

## Verificare după publicarea în producție

1. În proiectul Vercel `pucioasa-premium`, verifică dacă `https://urmatoarea-proprietate.ro/` servește direct aplicația cu HTTP `200`. Setează în Vercel redirecționarea `www` către domeniul principal, dacă `www` este conectat. Aplicația redirecționează paginile de la aliasul de producție `vercel.app` către domeniul oficial. Metadatele și sitemap-urile de producție folosesc domeniul oficial. Păstrează și `NEXT_PUBLIC_SITE_URL` pe domeniul oficial pentru linkurile folosite de celelalte integrări.
2. În proprietatea **Domain** deja verificată din Google Search Console, păstrează `https://urmatoarea-proprietate.ro/sitemap.xml` ca sitemap trimis. Google descoperă sitemap-urile copil. Instalarea curentă a activat deja RPC-urile de sitemap și căutare, iar actualizarea acestor metadate folosește schema existentă din Supabase.
3. În **URL Inspection**, testează pagina principală și un anunț publicat recent. Verifică accesul Googlebot și faptul că adresa canonică declarată este adresa finală. Dacă raportul afișează **Duplicate, Google chose different canonical than user**, verifică URL-ul din câmpul **Google-selected canonical**. Acesta arată adresa pe care Google a ales-o la ultima accesare. După ce **Test live URL** confirmă accesul la domeniul oficial, solicită indexarea acestuia. Verifică **Page indexing** pentru URL-urile trimise și **Core Web Vitals** pentru datele de la utilizatori reali.

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
