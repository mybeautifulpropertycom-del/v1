# Ghidul de început

Ghidul apare într-un card discret, în panou și în previzualizarea privată. Se adresează conturilor noi de agenți; administratorii, vizitatorii paginilor publice și modul demonstrativ nu îl văd.

Pașii se actualizează din datele salvate: profil de contact valid → proprietate cu detalii și fotografii → previzualizare și publicare → explicarea secțiunii Mesaje. O plată începută, anulată sau refuzată nu finalizează pasul de publicare. Ghidul nu trimite plăți și nu publică proprietăți automat. În editor, acțiunea ghidului păstrează formularul deschis, inclusiv modificările nesalvate.

„Mă descurc singur” închide definitiv ghidul. După publicare, „Deschide mesajele” duce la inbox, unde „Am înțeles” finalizează ghidul. Starea este păstrată în baza de date, separată pentru fiecare cont; se reîncarcă la autentificare și la revenirea în filă. Un ghid închis nu poate fi reactivat de o filă veche. Nu este necesară primirea unui lead real pentru finalizarea ghidului.

## Activare pe proiectul existent

Rulați întregul fișier `supabase/sql-editor-agent-onboarding.sql` în SQL Editor al proiectului Supabase existent. Rezultatul este `MBP_AGENT_ONBOARDING_READY`. Fișierul poate fi rulat din nou și nu înscrie conturile existente în ghid, nu schimbă proprietăți și nu pornește plăți sau generări video. Nu rulați fișierul de instalare completă peste baza existentă.

Înscrierea se face printr-un trigger la crearea unui profil nou după activare. Tabela `agent_onboarding` are RLS, iar agentul poate vedea și închide doar propriul ghid. Ștergerea contului elimină și această stare. Dacă migrarea nu este încă instalată sau citirea ghidului eșuează, panoul funcționează în continuare fără ghid.

Verificați cu un cont nou de test: salvarea profilului, salvarea ciornei cu fotografii, deschiderea previzualizării, afișarea variantelor de publicare, apoi Mesaje după publicare. Nu finalizați o plată reală doar pentru test. Verificați separat că închiderea persistă după reîncărcare și că un cont existent sau un administrator nu vede ghidul.
