# Prima publicare pe Vercel

Aplicația folosește Next.js cu funcții server pentru paginile publice și formularele de contact. Se publică drept proiect **Next.js**, cu suport server; nu folosi export static sau GitHub Pages.

Supabase este deja instalat în proiectul `aqfqhpdfhkegotsigemw`. **Nu rerula SQL-ul de instalare.** Pluginul Supabase din ChatGPT nu este necesar pentru hosting.

## 1. Codul în GitHub

Repository: `mybeautifulpropertycom-del/v1`.

În ramura pe care o publici trebuie să existe `package.json`, `package-lock.json`, `vercel.json` și directorul `src`. Dacă vezi doar README, ai selectat ramura inițială, fără aplicație. Modificările pregătite pe o ramură de lucru trebuie integrate în ramura de producție sau acea ramură trebuie selectată explicit pentru deployment.

## 2. Importul în Vercel

1. Deschide **Add New → Project** în contul/echipa Vercel potrivită.
2. Conectează GitHub și acordă aplicației Vercel acces la repository-ul `mybeautifulpropertycom-del/v1`.
3. Importă repository-ul. Verifică să fie selectată ramura care conține aplicația.
4. Folosește următoarele setări:

   | Setare           | Valoare                                            |
   | ---------------- | -------------------------------------------------- |
   | Framework Preset | Next.js                                            |
   | Root Directory   | rădăcina repository-ului (`./`), nu `v1` sau `src` |
   | Node.js          | 24.x                                               |
   | Install Command  | `npm ci` — definit în `vercel.json`                |
   | Build Command    | `npm run build:vercel` — definit în `vercel.json`  |
   | Output Directory | valoarea implicită pentru Next.js                  |

`build:vercel` verifică setările înainte de build. Lipsa configurației Supabase sau folosirea unei chei de administrare opresc publicarea, fără a afișa valorile cheilor. Modul demo rămâne disponibil local, prin `npm run dev` sau `npm run build`, fără configurație Supabase.

## 3. Variabilele Vercel

În **Environment Variables**, înainte de primul deployment, adaugă:

| Nume                            | Valoare                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://aqfqhpdfhkegotsigemw.supabase.co`                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cheia publică `sb_publishable_…` deja folosită, din Supabase → API Keys |

Selectează mediile în care testezi aplicația, de exemplu Production și Preview. În prima etapă, aceste deploymenturi folosesc aceeași bază Supabase: proprietățile și conturile reale sunt comune. Pentru experimente care modifică schema, folosește ulterior un proiect Supabase separat de staging.

`NEXT_PUBLIC_SITE_URL` poate rămâne nesetat la primul deployment. Linkurile de confirmare, resetare și distribuire sunt construite de aplicație din originea deschisă în browser. După activarea domeniului, poți seta variabila la `https://mybeautifulproperty.com` în mediul Production. Nu copia `http://localhost:3000` în configurația Vercel.

Pentru aplicația de bază nu sunt necesare cheile `service_role`, `sb_secret_…`, parola bazei sau tokenurile personale. Integrarea opțională Stripe are nevoie de o cheie Supabase de server separată, în `SUPABASE_SERVICE_ROLE_KEY`; vezi [configurarea Stripe](STRIPE-SETUP.md). Nu o pune în variabilele `NEXT_PUBLIC_`. Nu încărca `.env.local` în GitHub; fișierele locale de mediu și `.vercel/` sunt excluse. Valorile publice sunt incluse în browser la build, de aceea schimbarea lor cere **Redeploy**.

## 4. Primul deployment și autentificarea

Apasă **Deploy** și păstrează adresa HTTPS oferită de Vercel. Abia după un deployment reușit există un link public pe care îl putem verifica.

În Supabase → **Authentication → URL Configuration**:

- setează **Site URL** la originea HTTPS a deploymentului pe care îl folosești;
- adaugă în **Redirect URLs** acea origine urmată de `/dashboard/profile` și `/reset-password`;
- păstrează email/password și confirmarea emailului activate.

Pentru primul test folosește un URL stabil al proiectului sau al ramurii. URL-urile unice ale deploymenturilor se pot schimba; actualizează redirecturile dacă schimbi originea. Nu folosi wildcard-uri generale doar pentru a evita configurarea redirecturilor.

Supabase are restricții pentru serviciul email implicit. Configurează SMTP pentru confirmarea și recuperarea conturilor înainte de a invita clienți. Dacă trimiterea confirmării e refuzată, verifică SMTP și limitele din Auth; nu dezactiva confirmarea ca soluție de lansare.

Testul inițial: creează un cont, confirmă emailul, completează profilul, încarcă o fotografie proprie, salvează și publică o proprietate. Deschide pagina în alt browser, fără autentificare, și verifică formularul și inboxul. Apoi retrage pagina și verifică faptul că nu mai este accesibilă public. Repetă cu un al doilea agent pentru izolarea datelor.

## 5. Domeniul mybeautifulproperty.com

După testul de bază, adaugă `mybeautifulproperty.com` în **Project → Settings → Domains** și copiază la registrator exact înregistrările DNS cerute de Vercel. Nu folosi un IP sau un CNAME găsit într-un tutorial vechi. Păstrează înregistrările de email existente, dacă există.

După verificarea DNS și activarea HTTPS:

- actualizează Supabase Site URL la `https://mybeautifulproperty.com`;
- adaugă redirecturile `https://mybeautifulproperty.com/dashboard/profile` și `https://mybeautifulproperty.com/reset-password`;
- dacă folosești și `www`, configurează redirecționarea către domeniul principal în Vercel;
- retestează înregistrarea, recuperarea contului și pagina publică pe domeniul final.

Proprietățile sunt rute `/p/<slug>` în aceeași aplicație. Nu este nevoie de câte un proiect Vercel sau un domeniu pentru fiecare agent.

## Starea primei versiuni

Aceasta este versiunea pentru testarea produsului. Fotografiile demonstrative trebuie înlocuite cu fotografii proprii sau cu licență verificată înaintea lansării comerciale; vezi `docs/ASSETS.md`. Integrarea video, abonamentele clienților și notificările automate prin email nu sunt implementate încă. Autentificarea și salvarea datelor folosesc Supabase, dar verificările complete cu două conturi reale rămân necesare.

GitHub Actions verifică testele, sincronizarea SQL-ului generat, build-ul și fluxurile din browser în modul demo. Aceste verificări nu accesează baza reală și nu aplică migrări. Conexiunea reală poate fi verificată separat cu `npm run supabase:check` într-un mediu configurat.

Publicarea snapshotului mediului Codex este separată de deploymentul Vercel și de activarea domeniului.
