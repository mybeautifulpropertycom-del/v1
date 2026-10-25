# Conectarea Supabase pentru prima versiune

Planul gratuit este potrivit pentru prototipul actual. Aplicația folosește Auth, PostgreSQL și Storage, fără funcționalități care să necesite în mod obligatoriu planul Pro. Alegerea unui plan plătit poate fi făcută ulterior, după verificarea limitelor de consum și a cerințelor lansării.

Aplicația se conectează direct la Supabase prin biblioteca oficială. Pluginul ChatGPT este opțional: ar permite administrarea proiectului din conversație, dar nu este necesar pentru conturi, baze de date sau fotografii.

## Starea proiectului curent

URL-ul proiectului `aqfqhpdfhkegotsigemw` și cheia publică primite sunt configurate în `.env.local`, exclus din Git. Utilizatorul a instalat schema prin SQL Editor și a obținut `MBP_SETUP_OK`. **Nu reaplica instalarea inițială în acest proiect.**

Verificările efectuate direct împotriva proiectului real au confirmat:

- Auth răspunde cu HTTP 200; autentificarea prin email și înregistrarea sunt activate, iar confirmarea emailului este necesară.
- Funcția `get_public_property` există și returnează `null` pentru o proprietate inexistentă.
- Accesul anonim direct la `profiles`, `properties` și `inquiries` este refuzat cu eroarea de permisiuni `42501`.
- Funcția `submit_property_inquiry` respinge datele invalide fără să creeze un mesaj.
- Bucket-ul public `property-images` este accesibil: cererea pentru o imagine inexistentă returnează `Object not found`, iar un bucket de control inexistent returnează `Bucket not found`. Încărcarea unei fotografii nu a fost încă testată.
- În browser, dashboardul fără sesiune redirecționează spre autentificare. Ruta publică și formularul de contact returnează 404 pentru o proprietate inexistentă. Nu au apărut erori JavaScript.

Aceste verificări nu au creat conturi, proprietăți, fotografii sau mesaje și nu au trimis emailuri. Urmează testarea completă cu două conturi, confirmarea emailurilor, profiluri, încărcare, publicare și izolarea datelor între agenți. Adresa de preview/deployment și configurarea Auth redirects/SMTP rămân de stabilit. Domeniul final nu este încă conectat.

## Instalare fără plugin, pentru un proiect nou

Pașii de mai jos sunt păstrați pentru o instalare nouă. Proiectul curent are deja schema verificată.

1. Deschide [SQL Editor pentru proiectul aplicației](https://supabase.com/dashboard/project/aqfqhpdfhkegotsigemw/sql/new) și verifică proiectul selectat.
2. Deschide fișierul [sql-editor-setup.sql](../supabase/sql-editor-setup.sql), copiază **întregul conținut** într-o interogare nouă și apasă **Run**. Acesta creează cele trei tabele, regulile de acces pentru fiecare agent, funcțiile, profilul automat la înregistrare și bucket-ul de fotografii. Datele demonstrative nu sunt încărcate în proiect.
3. Rezultatul așteptat este `MBP_SETUP_OK`. Rulează fișierul integral, o singură dată: folosește o tranzacție, astfel încât o eroare să anuleze modificările din acea rulare. Dacă apare `already exists`, `duplicate key` sau altă eroare, trimite mesajul pentru verificare; nu șterge tabele, bucket-uri sau date pentru a forța instalarea.
4. După rezultat, asistentul poate rula verificarea conexiunii de mai jos cu cheia publică deja configurată. Nu este necesară o cheie de administrare sau o parolă de bază de date în conversație.

Fișierul SQL Editor este generat din migrarea originală prin `npm run supabase:prepare-sql`. Testele verifică instalarea, păstrarea datelor la o rerulare accidentală și anularea întregii instalări la un conflict apărut spre final. Acestea rulează local în PostgreSQL prin PGlite, cu schemele Supabase simulate; nu înlocuiesc testarea serviciilor reale.

Pentru dezvoltatori: instalarea manuală nu înregistrează migrarea în istoricul Supabase CLI. Înainte de a adopta ulterior `supabase db push`, inspectați schema și reconciliați istoricul migrațiilor; nu reaplicați migrarea inițială peste instalarea existentă.

## Ce este necesar acum

1. **Un proiect Supabase.** În dashboardul Supabase, creează sau selectează proiectul dedicat My Beautiful Property. Pentru clienți americani, alege o regiune apropiată de utilizatorii vizați. URL-ul API are forma `https://<project-reference>.supabase.co`.
2. **Pluginul, opțional.** Dacă instrumentele sale nu sunt disponibile în conversație, continuă prin SQL Editor, conform pașilor de mai sus. Un upgrade Supabase nu rezolvă disponibilitatea instrumentelor din ChatGPT.
3. **Configurația aplicației.** În setările mediului, completează câmpurile deja pregătite:

   | Câmp                            | Valoare                                                                   |
   | ------------------------------- | ------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | URL-ul proiectului din Supabase                                           |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cheia publică `sb_publishable_…` sau cheia legacy `anon`                  |
   | `NEXT_PUBLIC_SITE_URL`          | Originea pe care rulează aplicația; domeniul de producție după deployment |

   În Supabase, informațiile sunt în dialogul **Connect** sau în setările proiectului, la **API / API Keys**. Denumirile pot varia între versiuni. Cheia publică se pune în setările mediului; nu este necesară cheia `service_role`, o cheie `sb_secret_…`, parola bazei de date sau un personal access token pentru funcțiile de bază ale aplicației. Integrarea opțională Stripe folosește separat o cheie Supabase de server; vezi [configurarea Stripe](STRIPE-SETUP.md).

4. **Schema.** Folosește `supabase/sql-editor-setup.sql` pentru instalarea manuală inițială. Într-un flux administrat prin CLI, sursa este `supabase/migrations/202610230001_initial.sql`. Alege o singură metodă de instalare. Nu rerula migrarea peste o instalare existentă.
5. **Rețea.** Mediul cloud folosește o listă de domenii permise. După identificarea proiectului, trebuie permis hostname-ul său exact, `<project-reference>.supabase.co`, păstrând celelalte reguli. Salvarea unei modificări în draft nu dovedește că accesul este deja activ; conexiunea trebuie retestată.

## Verificarea conexiunii

Din directorul proiectului:

```bash
npm run supabase:check
```

Comanda citește variabilele exportate și fișierele locale `.env` / `.env.local`, fără să afișeze valorile cheilor. Verifică disponibilitatea serviciului Auth, funcția paginii publice și interzicerea accesului anonim direct la tabele. Nu creează conturi, nu trimite emailuri și nu modifică date. Dacă lipsesc URL-ul sau cheia, se oprește înainte de orice cerere de rețea.

Într-un mediu Node 24 care utilizează un proxy HTTP/HTTPS, verificarea poate fi rulată cu suportul de proxy al Node:

```bash
NODE_USE_ENV_PROXY=1 npm run supabase:check
```

După configurare, repornește serverul de dezvoltare sau reconstruiește deploymentul. Valorile `NEXT_PUBLIC_*` sunt incluse în aplicație la build.

## Verificarea efectivă a produsului

După conectare verificăm două conturi distincte, completarea profilului, încărcarea unei fotografii reale, salvarea unei proprietăți și accesul public la ea numai după publicare. Mai verificăm că mesajele ajung în inboxul agentului corect și că retragerea paginii oprește accesul public.

În **Authentication → URL Configuration**, setează **Site URL** la adresa reală de bază a aplicației și adaugă în **Redirect URLs** acea adresă urmată de `/dashboard/profile` și `/reset-password`. Dacă aplicația rulează pe calculatorul tău la `http://localhost:3000`, folosește acea origine. Pentru un preview cloud folosește originea HTTPS reală a preview-ului, iar după deployment domeniul final. Aceste adrese aparțin aplicației, nu proiectului `supabase.co`.

Păstrează autentificarea email/parolă și confirmarea emailului activate. Serviciul email implicit Supabase are restricții pentru testare; un SMTP propriu va fi necesar înainte de a invita clienți reali. Acesta este un pas separat de alegerea planului gratuit sau Pro.

Hostingul și DNS-ul pentru `mybeautifulproperty.com` se conectează după verificarea aplicației cu proiectul real. Higgsfield și editorul video rămân integrarea ulterioară.
