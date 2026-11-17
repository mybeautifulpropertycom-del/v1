# Ghidul de început

Ghidul apare ca un punct roșu lângă elementul relevant din panou sau din previzualizarea privată. Cardul compact se deschide automat la prima întâlnire cu fiecare pas și poate fi redeschis din punct. Cardul are maximum 300px, contur verde discret, săgeată de legătură când este spațiu lateral și un contor pentru cele șase etape. Nu are etichetă în afara cardului și nu ocupă spațiu în pagină. Se adresează conturilor noi de agenți; administratorii, vizitatorii paginilor publice și modul demonstrativ nu îl văd.

Etapele sunt profilul, detaliile proprietății, fotografiile, modelul, publicarea și Mesaje. În editor, cardurile existente sunt combinate cu o bordură roșie pe controlul activ; titlul câmpului rămâne în afară. Sunt parcurse, în ordine, denumirea, adresa, tipul proprietății, tipul ofertei, prețul, moneda, suprafața, unitatea de suprafață, dormitoarele, băile, notițele și facilitățile. Fotografiile și modelul au apoi propriile indicii.

Ghidul rămâne pe câmp cât timp agentul scrie. După părăsirea unui câmp valid, evidențiază următorul; nu mută automat focusul în timpul tastării. Din card, „Continuă” confirmă și valorile deja selectate și duce explicit la câmpul următor. Notițele și facilitățile sunt opționale și au acțiuni explicite de continuare fără completare. În zona facilităților se pot face mai multe selecții înainte de continuare. Cardurile nu se deschid automat în timpul editării unui control; punctul le poate redeschide oricând.

Parcurgerea câmpurilor este memorată în browser, separat pe agent și proprietate, folosind doar identificatorii câmpurilor. Nu sunt stocate aici textele sau valorile introduse. După salvarea ciornei și reîncărcare, ghidul reia următorul câmp neparcurs; o valoare devenită invalidă este evidențiată din nou. Închiderea definitivă a ghidului rămâne în contul Supabase, pe toate dispozitivele.

Validarea continuării rămâne comună ghidului, butoanelor și taburilor editorului: titlu valid, adresă, preț pozitiv și suprafață pozitivă înainte de fotografii, cel puțin o fotografie înainte de model. Ciornele incomplete se pot salva. Ghidul oferă întreaga succesiune de câmpuri, iar navigarea manuală rămâne disponibilă cu aceste validări. În previzualizare, indică butonul de publicare fără a-l apăsa. Publicarea are loc doar după confirmarea plății sau acordarea accesului gratuit de către administrator.

„Restrânge indiciul”, Escape sau apăsarea în afara lui lasă doar punctul. „Închide ghidul” îl închide definitiv. După publicare, „Deschide mesajele” duce la inbox, unde „Am înțeles” finalizează ghidul. Starea este păstrată în baza de date, separată pentru fiecare cont; se reîncarcă la autentificare și la revenirea în filă. Un ghid închis nu poate fi reactivat de o filă veche. Nu este necesară primirea unui lead real pentru finalizarea ghidului.

Cardurile își păstrează poziția față de elementul explicat. Pentru conținutul paginii, coordonatele sunt în document și cardul se deplasează natural odată cu acesta. Pentru un meniu sau toolbar fix, cardul rămâne lângă acel element. Nu există recalculări la scroll și cardurile nu sar pe cealaltă parte când se apropie de marginea ecranului. O schimbare a lățimii ecranului adaptează poziția pentru noul format; o simplă schimbare a înălțimii nu o schimbă. Deschiderea automată se face când elementul intră în zona vizibilă.

## Variante păstrate

- `codex/guide-baseline-1563eab`: aspectul anterior al cardurilor, înainte de încercarea cu chenare.
- `codex/guide-fields-02b43f3`: câmpuri cu borduri roșii, punct în colț, ghidare după blur și dialog centrat la apăsare.
- `codex/guide-cards-stable-d985ecc`: cardurile anterioare, cu poziția stabilizată la scroll, înainte de combinarea cu traseul complet pe câmpuri.
- Versiunea curentă combină aceste carduri cu evidențierea roșie și parcurgerea tuturor câmpurilor. Revenirea între variante este o schimbare de interfață, fără modificări ale proprietăților, plăților sau stării din Supabase.

## Activare pe proiectul existent

Rulați întregul fișier `supabase/sql-editor-agent-onboarding.sql` în SQL Editor al proiectului Supabase existent. Rezultatul este `MBP_AGENT_ONBOARDING_READY`. Fișierul poate fi rulat din nou și nu înscrie conturile existente în ghid, nu schimbă proprietăți și nu pornește plăți sau generări video. Nu rulați fișierul de instalare completă peste baza existentă.

Înscrierea se face printr-un trigger la crearea unui profil nou după activare. Tabela `agent_onboarding` are RLS, iar agentul poate vedea și închide doar propriul ghid. Ștergerea contului elimină și această stare. Dacă migrarea nu este încă instalată sau citirea ghidului eșuează, panoul funcționează în continuare fără ghid.

Verificați cu un cont nou de test: salvarea profilului, salvarea ciornei cu fotografii, deschiderea previzualizării, afișarea variantelor de publicare, apoi Mesaje după publicare. Nu finalizați o plată reală doar pentru test. Verificați separat că închiderea persistă după reîncărcare și că un cont existent sau un administrator nu vede ghidul.
