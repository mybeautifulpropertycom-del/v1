# Chatul din panou

`DashboardChat` încarcă asincron widgetul JivoChat `Bd02huXcxy` prin HTTPS numai când adresa este `/panou` sau începe cu `/panou/`. Se încarcă o singură dată pe document, după hidratare, prin `next/script`. Nu se transmite automat profilul agentului și nu se trimit mesaje de test.

Componenta de control rămâne în layoutul rădăcină ca să poată observa și ieșirea din panou. La ieșire forțează un document nou: eliminarea unui element `script` nu dezactivează codul deja executat de furnizor, conexiunile sau lucrul asincron rămas. Această limită include navigarea prin Link, redirecționările clientului și revenirea în istoricul browserului. Navigarea între subpaginile din panou rămâne normală.

Paginile `/modele/*`, previzualizările, proprietățile publicate și autentificarea nu încarcă widgetul. Colecția `/panou/modele` este parte din panou, în timp ce deschiderea unui model la `/modele/*` părăsește panoul.

Testele din `tests/connected/dashboard-chat.spec.ts` simulează răspunsul scriptului la limita HTTP și verifică încărcarea unică, absența pe pagini publice, trecerea în afara panoului, revenirea și un script întârziat. Configurația Playwright blochează rezolvarea domeniului scriptului pentru celelalte suite; testele chatului îl interceptează la limita HTTP. Nu contactează JivoChat și nu creează conversații reale.
