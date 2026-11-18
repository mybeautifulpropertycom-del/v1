# Distribuirea unei proprietăți publicate

În editor, coloana din dreapta afișează trei acțiuni verticale: „Publică pe grupuri”, „Copiază link-ul” și „Salvează ca PDF”. Acestea folosesc versiunea salvată și publicată, nu modificările nesalvate din formular. Proprietățile în ciornă nu afișează secțiunea.

„Publică pe grupuri” deschide un dialog cu un text editabil și fotografiile proprietății. Textul de bază conține datele exacte și linkul canonic. Un apel OpenAI adaugă o introducere scurtă în română, pe baza datelor salvate; prețul, suprafața, numerele de camere, adresa și linkul sunt alcătuite de aplicație. Cheia `OPENAI_API_KEY` și modelul `OPENAI_PROPERTY_MODEL` existente sunt folosite numai pe server. Nu se trimit către model datele leadurilor sau ale profilului agentului.

Ruta verifică autentificarea, proprietarul și starea publicată. Folosește limita AI existentă `reserve_property_story`: cel mult cinci redactări pe agent pe zi, cu un minut între solicitări. Nu este necesar SQL nou. Deschiderea și închiderea repetată nu regenerează textul deja pregătit în aceeași sesiune de browser. Schimbarea datelor salvate invalidează textul vechi. Editările manuale sau un text deja copiat nu sunt înlocuite de un răspuns AI sosit mai târziu. Dacă AI nu este disponibil, textul alcătuit din date rămâne editabil, iar fotografiile se pot descărca.

Fotografiile selectate se citesc din galeria proprietății, se exportă în JPG și se descarcă într-o singură arhivă ZIP, împreună cu `text-postare.txt`. Ordinea galeriei este păstrată. Pregătirea arhivei are loc pe dispozitivul agentului, cu progres și limite de dimensiune; nu traversează limita de răspuns a găzduirii web. Închiderea dialogului anulează descărcarea în curs. Fișierele de pe site rămân neschimbate.

Aplicația deschide lista de grupuri Facebook. Agentul alege grupul, începe o postare, lipește textul și atașează fotografiile dezarhivate. Nu sunt transmise automat textul sau fișierele într-un grup, nu se folosește un parametru de precompletare nesuportat și nu se publică în numele agentului. Afișarea listei de grupuri depinde de autentificarea și interfața Facebook.

Verificările automate interceptează răspunsurile OpenAI, Supabase și fotografiile: nu execută generări plătite sau postări reale pe Facebook. Testele verifică drepturile de acces, datele salvate, linkul canonic, cele trei carduri, copierea, protejarea editărilor, exportul JPG/ZIP și PDF-ul existent, pe desktop și telefon.
