# Trecerea la urmatoarea-proprietate.ro

Țintă: **https://urmatoarea-proprietate.ro**, fără `www`. Registrator: **Romarg**.
Proiectul Vercel folosit de platforma românească: **pucioasa-premium**.
Adresa temporară funcțională: **https://pucioasa-premium-beige.vercel.app**.

Schimbările din cod nu conectează automat DNS-ul, conturile externe sau căsuțele
de e-mail. Păstrați adresa temporară disponibilă pe parcursul configurării.
Conturile, proprietățile, imaginile și comenzile rămân în proiectul Supabase
existent; autentificarea pe noul domeniu folosește aceleași conturi, cu o sesiune
nouă în browser. Nu reinstalați baza de date și nu copiați datele în alt proiect.

## 1. Domeniul și HTTPS

1. Vercel → `pucioasa-premium` → Settings → Domains → Add Domain.
2. Adăugați `urmatoarea-proprietate.ro` pe Production. Debifați redirecționarea
   domeniului principal către `www`.
3. În zona DNS autoritară administrată în Romarg, modificați înregistrarea A
   pentru domeniul principal (`@`, sau numele complet cerut de interfață).
   În configurarea afișată de Vercel în această sesiune, valoarea este
   **216.198.79.1**. Folosiți întotdeauna valoarea afișată de proiectul Vercel,
   dacă aceasta se schimbă. Păstrați înregistrările de e-mail.
4. Așteptați **Valid Configuration** și certificatul HTTPS. Verificați că site-ul
   se deschide la noua adresă. Starea DNS nu a fost verificată de cod.
5. Adăugați și `www.urmatoarea-proprietate.ro`. Copiați exact înregistrarea
   CNAME/TXT cerută de Vercel pentru acesta; configurați `www` să redirecționeze
   permanent către domeniul fără `www`, păstrând calea și parametrii.

## 2. Autentificarea Supabase

Folosiți proiectul Supabase deja conectat la aplicație, nu un proiect nou.
În Authentication → URL Configuration, adăugați fără să eliminați URL-urile
existente:

- `https://urmatoarea-proprietate.ro/dashboard/profile`
- `https://urmatoarea-proprietate.ro/reset-password`
- `https://urmatoarea-proprietate.ro/panou/profil`
- `https://urmatoarea-proprietate.ro/resetare-parola`

Primele două sunt încă folosite de linkurile de autentificare; aplicația le
redirecționează către paginile românești, păstrând parametrii/fragmentele.
După activarea HTTPS, setați **Site URL** la
`https://urmatoarea-proprietate.ro`. Păstrați intrările pentru vechiul domeniu și
adresa temporară cât timp pot exista e-mailuri și sesiuni de plată active.

## 3. Hărțile Google

În cheia de browser existentă, la Website restrictions, adăugați:

- `https://urmatoarea-proprietate.ro/*`
- `https://www.urmatoarea-proprietate.ro/*`

Păstrați Maps JavaScript API și Places API (New), Map ID-ul și proiectul existent.
Verificați selecția unei adrese și harta unei proprietăți pe noul domeniu.

## 4. Linkurile, plățile și SEO

După ce domeniul funcționează, în Vercel → Environment Variables → Production:

```text
NEXT_PUBLIC_SITE_URL=https://urmatoarea-proprietate.ro
```

Faceți redeploy și așteptați Ready. Variabila este Config public, nu Secret.
Ea controlează originile pentru canonical, sitemap, partajare, PDF și noile
sesiuni Stripe. Căile existente ale proprietăților rămân aceleași.

În Stripe LIVE, actualizați URL-ul endpointului de webhook existent la:

```text
https://urmatoarea-proprietate.ro/api/stripe/webhook
```

Păstrați același endpoint și aceleași evenimente. Dacă este creat un endpoint
nou, folosiți signing secret-ul lui în Vercel și redeployați înainte de test.
Actualizați și website-ul/datele publice de contact ale afacerii în Stripe.
Cheile LIVE, prețul de 249 RON și comenzile existente se păstrează. Verificați
livrarea unui eveniment de test al endpointului în Stripe; un deploy reușit nu
confirmă de unul singur încasarea unei plăți reale.

Sesiunile de plată deja create pot conține adrese vechi. Acestea și idempotency
keys nu se rescriu. Păstrați vechile adrese funcționale până la încheierea lor.

## 5. Programările pentru video și notificări

După ce noul domeniu servește aplicația, executați în SQL Editor-ul proiectului
Supabase existent **supabase/migrate-platform-domain.sql**. Scriptul modifică
numai originea site-ului din secretul Vault `mbp_higgsfield_site`. Programările
existente pentru `/api/video/worker` și e-mailuri o folosesc deja. Secretul
workerului, CRON_SECRET, orarele și joburile existente se păstrează. Identificatorii
istorici `mbp`/`higgsfield` rămân pentru compatibilitatea instalării BytePlus.

## 6. E-mailurile și suportul

1. Creați sau redirecționați căsuța `contact@urmatoarea-proprietate.ro` la furnizorul
   de e-mail ales. Cumpărarea domeniului nu creează automat această căsuță.
2. În Resend, adăugați și verificați domeniul nou, folosind exact înregistrările
   DKIM/SPF/MX cerute de serviciu în zona DNS corectă. Păstrați înregistrările
   necesare furnizorului căsuței de e-mail; urmați numele/subdomeniile date de Resend.
3. După verificare, setați în Vercel Production și redeployați:

   ```text
   RESEND_FROM_EMAIL=contact@urmatoarea-proprietate.ro
   ```

   Adresa este Config server-side; cheia RESEND_API_KEY rămâne Secret. Numele
   expeditorului este automat „Următoarea Proprietate”. Până când noua variabilă
   este setată, aplicația păstrează expeditorul verificat anterior
   `account@mybeautifulproperty.com`, ca notificările să poată continua.
4. Separat, în Supabase → Authentication → SMTP, schimbați numele și adresa
   expeditorului numai după verificarea domeniului în furnizorul SMTP. Revizuiți
   și linkurile/numele vechi din șabloanele e-mailurilor de autentificare.
5. Verificați înscrierea, confirmarea e-mailului, resetarea parolei și un mesaj
   dintr-o proprietate folosind adrese proprii. Codul și testele automate nu trimit
   e-mailuri reale și nu efectuează plăți reale.

Notificările deja pregătite pentru retry își păstrează payloadul și expeditorul
inițial; modificarea lor ar încălca idempotency la furnizor.

## 7. Redirecționarea adreselor vechi

După verificările de mai sus, configurați redirecționarea permanentă a paginilor
vechi către domeniul principal, păstrând căile și parametrii. Domeniul vechi
`mybeautifulproperty.com` poate fi încă atașat altui proiect Vercel; configurați
redirecționarea în proiectul care îl deține. Verificați și varianta `www`.

Actualizați endpointurile API externe înainte de a activa o redirecționare globală:
Stripe și workerii au nevoie de un răspuns direct, nu de un redirect HTTP.
Păstrați vechea adresă temporară până când plățile și solicitările active sunt
închise. În Search Console adăugați noua proprietate, trimiteți sitemap-ul nou și,
dacă este cazul, folosiți schimbarea adresei pentru vechiul domeniu verificat.

## Starea inițială a migrării

Proprietarul a confirmat că noul domeniu deschide panoul aplicației după
configurarea înregistrării A. Verificarea independentă a DNS/HTTPS nu a fost
posibilă din mediul de lucru. Setările Vercel/Supabase/Stripe/Google/Resend,
varianta www și redirecționările domeniului vechi se verifică separat în conturi.
Aceste servicii nu au conectori sau credențiale administrative disponibile în
mediul de lucru. Completarea ghidului trebuie verificată în servicii; modificarea
codului nu înseamnă că migrarea externă este deja încheiată.
