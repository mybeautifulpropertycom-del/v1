# Ghidul de început

Ghidul evidențiază câmpul sau zona activă printr-un chenar roșu discret și un punct care pulsează lent în colțul din dreapta sus. Pentru câmpuri, culoarea este aplicată doar pe bordura controlului, iar titlul rămâne în afară. Marcajul este integrat în formular și se deplasează natural cu acesta la scroll. Nu se calculează poziții pe scroll.

La apăsarea punctului se deschide un dialog compact, centrat și stabil, cu explicația pasului. Nu se deschide automat. Dialogul folosește focusul și comportamentul Escape ale elementului nativ `dialog`; la închidere restaurează focusul și scrollul. Un alt dialog, inclusiv cel de plată, ascunde ghidul. Ghidul nu apare administratorilor, conturilor existente neînscrise, vizitatorilor paginilor publice sau în modul demonstrativ.

Câmpurile obligatorii din profil și din editor folosesc aceleași reguli de validare ca formularul. Evidențierea urmărește câmpul editat și rămâne acolo pe durata tastării, inclusiv după ce valoarea devine validă. După ieșirea din câmp, indică următoarea valoare obligatorie lipsă sau acțiunea de salvare/continuare. Nu mută focusul automat. Tab continuă navigarea normală între câmpuri. Din dialog, „Completează câmpul” sau „Următorul câmp” mută focusul doar la cererea agentului.

Etapele sunt profilul, detaliile proprietății, fotografiile, modelul, publicarea și Mesaje. Trecerea la fotografii cere titlu valid, adresă, preț pozitiv și suprafață pozitivă, plus respectarea limitelor existente. Trecerea la model cere și cel puțin o fotografie. Regulile se aplică ghidului, butoanelor normale și taburilor, inclusiv conturilor fără ghid. Ciornele incomplete pot fi salvate. Publicarea și plata rămân acțiuni explicite; ghidul nu le declanșează automat.

„Restrânge indiciul”, Escape sau apăsarea pe fundalul dialogului lasă doar punctul. „Închide ghidul” îl închide definitiv. După publicare, „Deschide mesajele” duce la inbox, unde „Am înțeles” finalizează ghidul. Starea este păstrată în Supabase, separată pentru fiecare cont și sincronizată între dispozitive. Nu este necesar un lead real pentru finalizare. Această schimbare nu necesită alt SQL.

## Punct de revenire

Varianta anterioară este păstrată la commitul `1563eab`, în ramura `codex/guide-baseline-1563eab`. Încercarea noului aspect este o schimbare de interfață, fără migrare de date. Revenirea se face prin anularea commitului acestei schimbări, păstrând plățile, proprietățile și starea conturilor.

## Activare pe proiectul existent

Rulați întregul fișier `supabase/sql-editor-agent-onboarding.sql` în SQL Editor al proiectului Supabase existent. Rezultatul este `MBP_AGENT_ONBOARDING_READY`. Fișierul poate fi rulat din nou și nu înscrie conturile existente în ghid, nu schimbă proprietăți și nu pornește plăți sau generări video. Nu rulați fișierul de instalare completă peste baza existentă.

Înscrierea se face printr-un trigger la crearea unui profil nou după activare. Tabela `agent_onboarding` are RLS, iar agentul poate vedea și închide doar propriul ghid. Ștergerea contului elimină și această stare. Dacă migrarea nu este încă instalată sau citirea ghidului eșuează, panoul funcționează în continuare fără ghid.

Verificați cu un cont nou de test: salvarea profilului, salvarea ciornei cu fotografii, deschiderea previzualizării, afișarea variantelor de publicare, apoi Mesaje după publicare. Nu finalizați o plată reală doar pentru test. Verificați separat că închiderea persistă după reîncărcare și că un cont existent sau un administrator nu vede ghidul.
