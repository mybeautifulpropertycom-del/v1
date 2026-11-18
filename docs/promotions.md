# Promovarea proprietăților în Google Search

„Promovare” înlocuiește „Studio video” în meniu și în invitația de pe pagina proprietăților. Adresele vechi ale studioului redirecționează la `/panou/promovare`. Filmele existente și publicarea cu sau fără videoclip rămân disponibile în prezentările proprietăților.

## Oferta și fluxul agentului

Pachetele Start, Plus și Extins costă 300, 500 și 1.000 RON. Întreaga sumă este buget publicitar Google Ads; configurarea și administrarea sunt incluse fără cost suplimentar, conform deciziei proprietarului platformei. Diferența dintre pachete este bugetul disponibil, nu un număr promis de clicuri, clienți sau poziții în Google. Sunt campanii în Google Search, pregătite pentru tipul proprietății, tranzacție și zona solicitată. Perioada și detaliile finale se stabilesc înainte de lansare.

Agentul selectează o proprietate publicată, alege pachetul, verifică zona și poate adăuga observații. Confirmarea duce la Stripe Checkout pentru o plată unică în RON. Plata nu transferă automat bugetul în Google Ads și nu lansează anunțuri. Campaniile sunt pregătite și lansate manual din contul Google Ads al platformei, după confirmarea plății și contactarea agentului.

Secțiunea „Promovările tale” arată starea comenzii și, după actualizarea de către echipă, starea campaniei, afișările, clicurile, bugetul folosit și raportul. Parametrii de revenire din Stripe nu confirmă plata; starea vine din registrul verificat de server.

## Activare

În Supabase SQL Editor, rulați întregul `supabase/sql-editor-promotions.sql` în proiectul existent. Rezultatul este `MBP_PROMOTION_PACKAGES_READY`. Fișierul poate fi rulat din nou; nu creează plăți, nu schimbă proprietăți și nu pornește campanii sau filme. Fără această actualizare, pachetele pot fi văzute, dar plățile rămân indisponibile.

Se folosesc configurarea Stripe și webhookul existente: `STRIPE_CHECKOUT_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` și `NEXT_PUBLIC_SITE_URL`. Plățile reale respectă și `STRIPE_LIVE_PAYMENTS_ENABLED=true`. Pachetele sunt definite pe server; nu trebuie create manual produse sau prețuri în Stripe. Nu sunt necesare alte chei de plată sau un webhook nou.

Webhookul existent `/api/stripe/webhook` trebuie să primească evenimentele `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated` și `charge.dispute.closed`, deja folosite de plățile pentru proprietăți. Evenimentele de promovare sunt separate prin metadate și nu pornesc publicarea sau generarea video.

## Administrare și livrare

Din Administrare → „Comenzi de promovare Google Ads” se deschide `/panou/administrare/promovare`. Implicit sunt afișate numai comenzile reale. Lista conține contactul agentului, pagina proprietății, bugetul, zona, observațiile și exemplele de cuvinte cheie de verificat. Linkul pregătit pentru anunț include parametri UTM pentru campanie.

Administratorul:

1. Verifică plata confirmată și proprietatea publicată; contactează agentul și stabilește detaliile și perioada.
2. Configurează campania Google Search în contul platformei. Cheltuielile Google Ads sunt efectuate manual, nu de aplicație.
3. Marchează campania activă numai după lansare, introducând ID-ul real al campaniei Google Ads.
4. Actualizează cifrele reale și bugetul folosit. La încheiere adaugă raportul, vizibil agentului.

Comenzile de test nu pot fi trecute în stări de campanie reală. O rambursare sau contestație apărută după activare este semnalată pentru verificare și oprire manuală în Google Ads. Retragerea de la publicare, ștergerea sau schimbarea proprietarului paginii semnalează automat promovările reale plătite aflate în pregătire sau active. Înregistrarea de plată și motivul opririi se păstrează și când proprietatea este ștearsă. Pentru o proprietate vândută ori închiriată, agentul folosește „Solicită oprirea promovării” și alege motivul; aplicația nu presupune automat că o tranzacție s-a încheiat. Solicitarea funcționează și dacă noile plăți Stripe sunt dezactivate și nu modifică plata sau pagina publicată. Aplicația nu poate opri o campanie externă în această versiune. Administratorul confirmă apoi starea „Campanie oprită”; semnalarea rămâne activă până la această confirmare. Pentru un motiv de vânzare, închiriere sau oprire solicitată de agent, aceeași promovare nu poate fi reactivată din greșeală. Activarea și retragerea proprietății folosesc aceeași ordine de blocare în baza de date, pentru a nu putea activa simultan o campanie către o pagină care tocmai dispare. Rambursările se gestionează în Stripe; nu se lansează automat din acest tab.

## Garanții tehnice și verificări

Registrul `promotion_orders` este separat de plățile de publicare. Agentul poate citi doar propriile comenzi și nu poate modifica plata sau raportul. Crearea plății, confirmarea și actualizarea campaniilor sunt operații de server. Rezervarea este serializată pe proprietate și mod Stripe; există o singură plată în așteptare pentru acea proprietate și acel mod. Reîncercările refolosesc sesiunea Stripe prin cheia de idempotență. Pentru alt pachet sau alt brief, agentul anulează mai întâi plata nefinalizată; sesiunea este expirată în Stripe înainte de anularea locală.

Serverul verifică semnătura webhookului și citește starea curentă a plății și a încasării din Stripe. Verifică suma, moneda, modul, proprietarul și comanda. O notificare întârziată de plată nu poate reactiva un buget rambursat. Rambursările și contestațiile de promovare nu retrag site-ul proprietății de la publicare.

Testele folosesc răspunsuri simulate pentru Stripe și Supabase. Nu execută plăți reale, campanii Google sau cheltuieli publicitare. O integrare Google Ads API poate fi adăugată separat ulterior, cu acces autorizat la contul platformei; nu este inclusă în această implementare.
