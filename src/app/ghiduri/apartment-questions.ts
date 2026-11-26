export type ApartmentQuestion = {
  slug: string;
  title: string;
  description: string;
  answer: string;
  sections: { title: string; paragraphs: string[] }[];
};

export const apartmentQuestions: ApartmentQuestion[] = [
  {
    slug: "apartament-nou-sau-vechi",
    title: "Apartament nou sau vechi? Ce merită să compari",
    description:
      "Compară un apartament într-un bloc nou cu unul într-un bloc vechi. Vezi ce contează la predare, cum verifici starea blocului și ce lucrări sunt necesare.",
    answer:
      "Compară apartamentele după ce primești la predare, cum este întreținut blocul și cât de bine ți se potrivește zona. Dacă te poți muta imediat într-unul dintre ele, iar celălalt cere lucrări sau luni de așteptare, ia în calcul și ce presupun acele luni pentru tine.",
    sections: [
      {
        title: "Ce verifici la un apartament într-un bloc nou",
        paragraphs: [
          "Întreabă care este stadiul apartamentului pe care îl vei cumpăra și ce finisaje sunt incluse. Dacă ai văzut un apartament de prezentare, cere să vezi unitatea exactă sau planul ei. Uită-te la lumină, priveliște și compartimentare. Pot fi diferite de la un etaj la altul.",
          "Dacă blocul este încă în lucru, cere în scris data prevăzută pentru predare și ce lucrări sau racorduri mai sunt de făcut. Mergi și pe strada din jurul ansamblului. Vezi ce transport poți folosi astăzi și cât ai de mers pe jos până la el.",
        ],
      },
      {
        title: "Ce verifici la un apartament într-un bloc vechi",
        paragraphs: [
          "Întreabă când s-au schimbat instalațiile din apartament și ce lucrări au fost făcute în bloc. O baie refăcută recent poate avea în continuare coloanele vechi ale clădirii. Uită-te și la lift, casa scării, zonele cu urme de umezeală și orice lucrare despre care vorbește asociația de proprietari.",
          "Cere documentele de expertiză, dacă există, și verifică adresa în evidențele publice locale. Dacă ai nelămuriri despre starea clădirii, discută cu un inginer structurist. Poți vedea dintr-o vizită și câteva lucruri greu de aflat din fotografii, cum ar fi zgomotul de pe scară și câtă lumină intră la ora la care ești acasă de obicei.",
        ],
      },
      {
        title: "Cum alegi între două oferte care îți plac",
        paragraphs: [
          "Vizitează-le, pe cât posibil, la aceeași oră. Notează când ai primi cheile, ce ai schimba înainte de mutare și cât faci până la serviciu sau la școală. Dacă o ofertă include o parcare sau o boxă, verifică ce drept primești și ce este trecut în acte.",
          "Întreabă-te ce ai vrea să fie deja rezolvat în ziua mutării. Pentru unii cumpărători contează să poată intra imediat. Alții pot aștepta dacă apartamentul are compartimentarea pe care o caută de mult.",
        ],
      },
    ],
  },
  {
    slug: "apartament-decomandat-sau-semidecomandat",
    title: "Apartament decomandat sau semidecomandat?",
    description:
      "Află ce înseamnă apartament decomandat și semidecomandat. Compară accesul în camere, intimitatea și modul în care vei folosi livingul.",
    answer:
      "Într-un apartament decomandat, camerele au acces separat din hol. La un semidecomandat, treci de obicei printr-o cameră, adesea prin living, ca să ajungi în altă parte a locuinței. Planul îți arată traseul exact, iar acesta contează mai ales când mai multe persoane au programe diferite.",
    sections: [
      {
        title: "Cum recunoști compartimentarea pe plan",
        paragraphs: [
          "Urmărește cu degetul drumul de la intrarea în apartament până la dormitor și baie. Dacă poți ajunge la ele direct din hol, ai acces separat. Dacă traseul trece prin living, gândește-te pe unde ai merge dimineața dacă cineva încă doarme sau lucrează acolo.",
          "Un living cu bucătărie deschisă descrie cum sunt așezate acele două spații. Accesul la dormitoare îl verifici separat. Când eticheta din anunț e neclară, cere planul cu ușile și intrările în camere.",
        ],
      },
      {
        title: "Când te ajută un apartament decomandat",
        paragraphs: [
          "Accesul direct din hol e practic dacă locuiești cu cineva care se culcă sau se trezește la altă oră. Un dormitor poate fi folosit ca birou cu ușa închisă, iar restul locuinței rămâne ușor de parcurs.",
          "Uită-te și cât spațiu ocupă holul și unde încape un dulap. La două apartamente cu aceeași suprafață utilă, o intrare mai lungă poate însemna că ai mai puțin loc în camerele pe care le folosești cel mai mult.",
        ],
      },
      {
        title: "Când poate funcționa bine un semidecomandat",
        paragraphs: [
          "Dacă îți place să petreci mult timp în living și traseul spre celelalte camere te încurcă rar, un semidecomandat poate fi o opțiune bună. Verifică unde poți pune canapeaua și masa, astfel încât să rămână loc de trecere fără să ocolești mobilierul.",
          "În timpul vizionării, parcurge traseul de câteva ori. Imaginează-ți că vii cu sacoșe, că primești oaspeți sau că unul dintre voi merge la baie seara. O diferență care pare mică pe plan se simte altfel într-o zi obișnuită.",
        ],
      },
    ],
  },
  {
    slug: "ce-etaj-sa-alegi-la-apartament",
    title: "Ce etaj să alegi la apartament?",
    description:
      "Compară parterul, etajele intermediare și ultimul etaj când cumperi un apartament. Vezi ce să verifici la lift, lumină, zgomot și acoperiș.",
    answer:
      "Alege etajul după felul în care vei folosi apartamentul. La parter contează accesul și intimitatea. La etajele intermediare merită să verifici lumina și zgomotul de la vecini. La ultimul etaj, întreabă despre acoperiș și cât de cald se face vara.",
    sections: [
      {
        title: "Parterul și etajele joase",
        paragraphs: [
          "Accesul pe scări poate conta dacă vii des cu un cărucior, cu o bicicletă sau cu cumpărături. Verifică și diferența de nivel de la trotuar până la ușa apartamentului. Unele blocuri au câteva trepte chiar la intrare.",
          "Apropie-te de ferestre cu jaluzelele ridicate. Vezi dacă se uită direct spre alee sau parcare și cum se aude intrarea în bloc. Uită-te ce se află sub apartament. Dacă este subsol, întreabă despre umezeală și lucrările făcute acolo.",
        ],
      },
      {
        title: "Etajele intermediare",
        paragraphs: [
          "Ia liftul, apoi coboară o dată pe scări. Poți judeca mai ușor cum ar fi să ajungi acasă într-o zi când liftul este ocupat sau în revizie. Întreabă dacă același lift deservește parcarea ori subsolul, dacă acele spații contează pentru tine.",
          "Verifică ce se vede din camere la ora la care stai cel mai mult acasă. Un bloc apropiat poate influența lumina și intimitatea chiar și la un etaj mai ridicat. Ascultă și zgomotul de lângă lift, de pe scară sau de la vecini.",
        ],
      },
      {
        title: "Ultimul etaj",
        paragraphs: [
          "Întreabă ce este deasupra apartamentului și cine se ocupă de întreținere. Poate fi acoperișul, un pod tehnic sau o terasă comună. Cere informații despre ultima lucrare de hidroizolație și uită-te la tavan și la colțurile de lângă pereții exteriori.",
          "Dacă vizitezi iarna, întreabă cum se simte apartamentul în zilele foarte calde. Dacă vizitezi vara, cere exemple de facturi pentru încălzire. Când alegi între două etaje, compară condițiile pe care le poți verifica în fiecare apartament. Etajul din anunț îți dă doar punctul de plecare.",
        ],
      },
    ],
  },
];
