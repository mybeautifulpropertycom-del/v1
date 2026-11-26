type GuideArticle = {
  slug: string;
  title: string;
  description: string;
  introduction: string;
  offer: "sale" | "rent";
  sections: {
    id: string;
    title: string;
    paragraphs: string[];
  }[];
  sources?: { title: string; url: string }[];
};

export const guideArticles: GuideArticle[] = [
  {
    slug: "acte-cumparare-apartament",
    title: "Ce acte verifici când cumperi un apartament",
    description:
      "Află ce să verifici în actul de proprietate, cartea funciară și planul cadastral înainte de a semna sau de a plăti un avans pentru apartament.",
    introduction:
      "Ai găsit un apartament care îți place și discuția a ajuns la avans. Înainte să stabilești suma sau data semnării, cere vânzătorului documentele pe care le are și alege notarul cu care vei discuta. Uită-te cine vinde, ce este înscris în cartea funciară și cum arată apartamentul în plan.",
    offer: "sale",
    sections: [
      {
        id: "proprietarul",
        title: "Cine vinde și ce intră în preț",
        paragraphs: [
          "Întreabă cum a dobândit vânzătorul apartamentul. Actul poate fi, de exemplu, un contract de vânzare sau un certificat de moștenitor. Dacă sunt mai mulți proprietari ori cineva semnează în numele altcuiva, spune-i notarului de la prima discuție. El poate verifica cine trebuie să semneze și ce documente sunt necesare.",
          "Un loc de parcare sau o boxă pot avea acte separate ori pot face obiectul unui drept de folosință. Cere să fie clar, în scris, ce plătești și ce drept vei avea după cumpărare.",
        ],
      },
      {
        id: "cartea-funciara",
        title: "Ce apare în cartea funciară",
        paragraphs: [
          "Cere numărul cadastral și numărul cărții funciare. Dacă vezi o ipotecă, o interdicție sau o mențiune pe care nu o înțelegi, trimite documentul notarului. La un apartament cu ipotecă, întreabă din timp cum se sting datoria și înscrierea și când pot fi plătiți banii, mai ales dacă și tu cumperi prin credit.",
          "Poți consulta un extras de informare la începutul discuției. Notarul îți va spune ce verificări actualizate face pentru semnare și îți poate confirma dacă dosarul are nevoie de documente suplimentare.",
        ],
      },
      {
        id: "planul",
        title: "Planul cadastral și ce ai văzut la vizionare",
        paragraphs: [
          "Pune planul lângă fotografii sau, dacă poți, ia-l la vizionare. Uită-te unde apar pereții, balconul și intrările în camere. Dacă bucătăria a fost mutată sau balconul a fost închis, întreabă ce documente există pentru schimbare. Notează diferențele și trimite-le notarului. Dacă iei credit, spune-i și băncii.",
        ],
      },
      {
        id: "avansul",
        title: "Ce clarifici înainte de avans",
        paragraphs: [
          "Cere lista documentelor pentru cazul tău. Ea poate include, printre altele, certificatul fiscal, certificatul de performanță energetică și o adeverință de la asociația de proprietari. Lasă timp în calendar pentru documentele care trebuie obținute.",
          "Înainte să transferi bani, citește cu notarul clauzele despre termen, contul în care plătești și ce se întâmplă cu avansul dacă dosarul de credit este respins sau dacă actele întârzie. Notează și când primești cheile. E mai ușor să lămurești aceste lucruri înainte de semnare.",
        ],
      },
    ],
    sources: [
      {
        title: "Agenția Națională de Cadastru și Publicitate Imobiliară",
        url: "https://www.ancpi.ro/",
      },
      {
        title: "Uniunea Națională a Notarilor Publici din România",
        url: "https://www.uniuneanotarilor.ro/",
      },
    ],
  },
  {
    slug: "costuri-cumparare-apartament",
    title: "Cât te costă să cumperi un apartament",
    description:
      "Calculează bugetul de cumpărare dincolo de prețul afișat. Pune deoparte bani pentru semnare, credit, mutare și primele lucrări.",
    introduction:
      "Când deschizi un anunț, prețul e prima cifră pe care o notezi. Merită să mai faci o listă cu banii de care ai nevoie până primești cheile și cu ce vei plăti în lunile următoare. Un apartament ceva mai ieftin poate cere mai mulți bani înainte de mutare dacă trebuie refăcută instalația sau cumpărat mobilierul.",
    offer: "sale",
    sections: [
      {
        id: "la-semnare",
        title: "Ce intră în suma de la semnare",
        paragraphs: [
          "Cere notarului o estimare scrisă pentru tranzacția ta, cu onorariul, costurile de înscriere și suma pe care o plătește fiecare parte. Dacă lucrezi cu o agenție, verifică procentul sau suma din contract, dacă include TVA și momentul când se plătește.",
          "Dacă apartamentul este vândut de un dezvoltator, clarifică în scris dacă prețul comunicat include TVA și dacă parcarea, boxa sau finisajele care te interesează au preț separat. Cere suma finală pentru tot ce vrei să cumperi.",
        ],
      },
      {
        id: "creditul",
        title: "Dacă iei credit, separă avansul de restul cheltuielilor",
        paragraphs: [
          "Pe lângă avans, întreabă banca ce vei plăti pentru evaluare, documente, comisioane și asigurările cerute pentru oferta ta. Cere și un scenariu cu rata după perioada de dobândă fixă, dacă oferta are o astfel de perioadă.",
          "De exemplu, dacă ai economisit 23.000 de euro, iar avansul pentru oferta discutată este de 20.000 de euro, rămâi cu 3.000 de euro pentru semnare, mutare și rezervă. Înlocuiește sumele din acest exemplu cu estimările scrise pe care le primești, ca să vezi cu cât rămâi efectiv.",
        ],
      },
      {
        id: "dupa-mutare",
        title: "Ce vei plăti după mutare",
        paragraphs: [
          "Cere câteva valori de întreținere și utilități din luni diferite. Întreabă câte persoane locuiau în apartament atunci și ce se plătește separat. Pune în buget reparațiile de care ai nevoie imediat. O priză care trebuie schimbată și o instalație care trebuie refăcută duc la bugete foarte diferite.",
          "Fă două calcule înainte să compari oferte. Primul este cât plătești până primești cheile. Al doilea este cât îți rămâne într-o lună obișnuită după rată, utilități și transport. Păstrează un rând pentru cheltuielile despre care încă aștepți o ofertă.",
        ],
      },
    ],
  },
  {
    slug: "contract-inchiriere-apartament",
    title: "Ce verifici în contractul de închiriere al unui apartament",
    description:
      "Verifică înainte de semnare garanția, plata chiriei, utilitățile, reparațiile și inventarul de predare al apartamentului.",
    introduction:
      "La vizionare te gândești unde ai pune masa sau cum ai ajunge dimineața la muncă. Înainte să dai garanția, fă-ți puțin timp și pentru contract. Câteva lucruri puse clar în scris acum îți vor prinde bine dacă o factură vine târziu, se strică un aparat sau trebuie să te muți mai devreme decât ai plănuit.",
    offer: "rent",
    sections: [
      {
        id: "partile",
        title: "Cine semnează și ce primești",
        paragraphs: [
          "Verifică cine îți închiriază apartamentul și cine are dreptul să semneze. Dacă discuți printr-un intermediar, întreabă cine va încasa chiria și când primești contractul semnat. Verifică adresa, data la care primești cheile și dacă locul de parcare sau boxa pe care le-ai văzut sunt incluse.",
          "Notează lucrurile care contează pentru felul în care vei locui acolo. Dacă ai un animal de companie sau vrei să lucrezi de acasă, e mai simplu să discuți asta de la început și să treci în contract ce ați convenit.",
        ],
      },
      {
        id: "platile",
        title: "Chiria, garanția și facturile",
        paragraphs: [
          "Recitește suma, moneda, data lunară de plată și contul. Dacă chiria este stabilită în euro și plătești în lei, clarifică ce curs folosiți. Întreabă ce utilități achiți direct, cum primești dovada cheltuielilor și ce consum este aferent perioadei dinaintea mutării.",
          "Pentru garanție, verifică suma, termenul de restituire și situațiile în care se pot reține bani. Păstrează o dovadă a plății. Întreabă și cum veți închide facturile care sosesc după ce ai predat deja cheile.",
        ],
      },
      {
        id: "predarea",
        title: "Fă inventarul când primești cheile",
        paragraphs: [
          "Treceți într-un proces-verbal numărul de chei, indexurile contoarelor și starea lucrurilor lăsate în apartament. Faceți fotografii de comun acord, în special dacă sunt deja urme de uzură. Dacă frigiderul are un sertar crăpat sau o ușă nu se închide bine, consemnați atunci. E mai simplu decât să vă amintiți peste un an.",
        ],
      },
      {
        id: "plecarea",
        title: "Cum anunți o reparație sau o mutare",
        paragraphs: [
          "Stabiliți cui îi scrii când apare o defecțiune și cum vă dați acordul pentru reparații. Citește clauzele despre durata contractului, prelungire, încetare și preaviz. Dacă o formulare poate fi înțeleasă în două feluri, cere să fie clarificată înainte de semnare. La final, păstrează contractul, inventarul și dovezile plăților în același loc.",
        ],
      },
    ],
  },
];

export function guideArticlePath(slug: string) {
  return `/ghiduri/${slug}`;
}
