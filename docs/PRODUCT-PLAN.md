# My Beautiful Property — plan de produs

## Prima versiune

Aplicația este în engleză, pentru piața americană. Implicit: USD, square feet, bedrooms și bathrooms. Am păstrat moneda și unitățile separat de numere, pentru extindere ulterioară. Există o configurație de locale și un dicționar inițial; traducerea completă în alte limbi este o etapă viitoare.

Agentul își creează contul și completează numele, agenția, emailul de contact, telefonul și prezentarea. Adaugă proprietăți, fotografii și detalii. Alege unul dintre trei designuri, editează, previzualizează și publică. Formularul de contact trimite solicitările în inboxul privat al agentului după conectarea Supabase.

În lipsa configurației Supabase, aplicația funcționează în mod demo local, indicat explicit. Nu creează conturi reale și nu publică proprietățile pe internet.

## Domeniul comun

Recomandarea pentru lansare este un singur domeniu și o adresă pentru fiecare proprietate:

`https://mybeautifulproperty.com/p/the-palm-residence-<identificator-unic>`

Nu trebuie cumpărat un domeniu pentru fiecare agent sau proprietate. Conectezi domeniul o singură dată la hosting; aplicația servește toate paginile și identifică proprietatea din adresă. Agenții distribuie linkul prin email, mesaje, social media sau cod QR.

Datele fiecărui cont sunt separate prin reguli în baza de date. Publicul vede doar paginile publicate. Schimbarea datelor de contact se propagă în toate paginile agentului. În această versiune, adresa unei proprietăți rămâne stabilă după prima salvare, inclusiv când se schimbă titlul.

Mai târziu putem adăuga domenii proprii pentru agenții care doresc acest lucru. Acest lucru ar necesita verificarea proprietății domeniului, DNS, TLS și rutare pe hostname. Nu este necesar pentru cerința actuală.

## Servicii și buget orientativ

Estimări de planificare, în USD, nu oferte verificate în timp real. Paginile oficiale de prețuri nu au putut fi accesate din rețeaua acestui mediu; tarifele, limitele și taxele trebuie confirmate înainte de achiziție.

| Serviciu                                          | Rol                                                   | Buget orientativ                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Supabase](https://supabase.com/pricing)          | Conturi, PostgreSQL, fotografii                       | Plan gratuit pentru prototip; aproximativ $25/lună pentru planul de producție de bază, plus eventual consum                                   |
| [Vercel](https://vercel.com/pricing)              | Hosting Next.js, domeniu și HTTPS                     | Aproximativ $20/lună pentru un utilizator Pro, plus consum; verifică termenii planului potrivit utilizării comerciale                         |
| Registrar de domenii                              | `mybeautifulproperty.com`                             | De regulă $10–25/an pentru un `.com` standard; poate fi mult mai scump dacă este premium. Disponibilitatea și deținerea nu au fost verificate |
| [Resend](https://resend.com/pricing) sau alt SMTP | Confirmare cont, resetare parolă, ulterior notificări | Plan gratuit limitat pentru testare; aproximativ $20/lună pentru un plan plătit de bază                                                       |
| [Stripe](https://stripe.com/pricing)              | Abonamente și plăți                                   | Comisioane per tranzacție; Billing/Tax pot adăuga taxe separate. Integrarea nu este încă implementată                                         |
| Higgsfield / furnizor video API                   | Generarea clipurilor                                  | Buget separat, în funcție de API, model, durată, rezoluție și numărul de generări. Tariful și disponibilitatea API nu sunt confirmate         |

Pentru o lansare mică: aproximativ **$45–70/lună**, plus domeniu, generare video, taxe și eventuale depășiri de trafic/stocare. Nu include dezvoltarea, marketingul sau serviciile care nu sunt încă implementate. Fiecare landing page nu implică un abonament separat de hosting.

## Video, în etapa următoare

1. Confirmăm furnizorul, accesul API și denumirea exactă a modelului dorit. Un abonament la interfața web a unui furnizor nu garantează acces API sau drept de revânzare într-un SaaS.
2. Generarea rulează în joburi de fundal, cu stări `queued`, `processing`, `completed`, `failed`, retry controlat și webhook verificat. Cheile furnizorului rămân pe server.
3. Fotografiile alese de agent devin input; agentul selectează formatul vertical sau orizontal și durata. Nu presupunem că modelul poate conserva perfect geometria proprietății — clipul trebuie verificat înainte de publicare.
4. Salvăm clipul final în storage, îl putem include în landing page și oferim descărcare.
5. Integrarea editorului video vine după confirmarea API/SDK, licenței și costului său.

Recomand abonament pentru pagini/proprietăți și credite separate pentru video. Astfel costurile de generare rămân previzibile. Numărul de credite și prețurile se stabilesc după măsurarea costului real pe clip, inclusiv generările nereușite și regenerările.

## Ordinea recomandată

1. Revizuirea vizuală a dashboardului și a celor trei template-uri.
2. Conectarea Supabase, testarea conturilor separate și a fotografiilor reale.
3. Deployment de staging, apoi conectarea domeniului și testarea unui link public de pe alt dispozitiv.
4. SMTP și notificări, protecție anti-spam, abonamente și limite de utilizare.
5. Integrarea video, credite, editorul de videoclipuri și testarea costurilor.
6. Limbi suplimentare, statistici reale, domenii personalizate și instrumente pentru agenții cu echipe.

Statisticile din dashboardul actual numără proprietățile și stările lor. Nu sunt afișate vizualizări, lead-uri sau conversii inventate.
