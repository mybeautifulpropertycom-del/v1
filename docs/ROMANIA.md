# Versiunea pentru România

Aplicația folosește limba română (`ro-RO`), EUR și m² pentru proprietățile noi. Agentul poate alege și RON. Valorile, identificatorii și textele proprietăților existente nu sunt convertite sau rescrise automat. Textele noi generate de serviciul AI sunt cerute în română. Modelele The Editorial, The Heritage și The Atelier își păstrează numele și URL-urile.

Pachetul site + film de prezentare costă **249 RON**, plată unică. Serverul trimite către Stripe **24900 bani / ron**, independent de moneda anunțului. Formularele Stripe folosesc limba română. Testele de plată folosesc servicii simulate, fără încasări reale.

## Supabase și publicare

Nu reaplica instalarea inițială pe un proiect existent. Dacă actualizarea pentru România a fost deja aplicată într-o sesiune anterioară, verifică mai întâi schema: comenzile noi trebuie să aibă valorile implicite `amount = 24900`, `currency = 'ron'`, iar proprietățile `currency = 'EUR'`, `area_unit = 'sqm'`.

Doar dacă actualizarea lipsește, fișierul `supabase/sql-editor-romania.sql` conține actualizarea aditivă, tranzacțională și repetabilă. Păstrează chitanțele istorice de 97 USD și nu rescrie sesiunile Stripe active. Comenzile vechi neplătite, fără sesiune Stripe, trec la 249 RON. Pentru o comandă veche cu sesiune de plată, aplicația oprește o nouă plată și cere verificarea administratorului; nu reutilizează în tăcere o sesiune de 97 USD. Rambursările istorice sunt verificate față de suma și moneda comenzii originale.

Nu s-au executat migrări pe un serviciu Supabase real și nu s-a făcut nicio publicare Vercel în această sesiune. Configurarea existentă de autentificare, stocare și plăți trebuie păstrată. Configurarea e-mailurilor Supabase și a limbii din șabloanele sale se face separat în proiectul Supabase; textele aplicației și notificările proprii sunt în română.

## Dezvoltare

Din `/workspace/v1`, cu Node.js 24:

```bash
npm ci --cache /tmp/mbp-npm-cache
npm run build
npm run typecheck
npm test
npm run test:e2e
npm run dev
```

Fără configurație Supabase, aplicația pornește în modul demonstrativ. Profilul, proprietățile și adresele demonstrative sunt fictive. Fotografiile de exemplu nu stabilesc o adresă reală; nu plasăm un indicator pe hartă pentru acestea. Adresele reale sugerate prin Google Maps sunt limitate la România, iar distanțele sunt afișate în kilometri.

Folosește checkout-ul izolat existent; nu crea un Git worktree fără o cerere explicită. Costurile furnizorilor video rămân în USD, separat de prețul în RON al pachetului.
