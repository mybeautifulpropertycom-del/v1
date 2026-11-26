export const buyerTools = [
  {
    slug: "calculator-credit-ipotecar",
    title: "Calculator de rată pentru credit ipotecar",
    seoTitle: "Calculator credit ipotecar | Calculează rata lunară",
    description:
      "Estimează rata unui credit ipotecar după preț, avans, dobândă și perioadă. Vezi suma finanțată, dobânda totală și cât ai plăti băncii.",
    intro:
      "Ai găsit un apartament și vrei să știi ce rată ar însemna pentru tine? Introdu prețul, avansul și condițiile pe care vrei să le compari.",
    explanationTitle: "Cum se calculează rata",
    explanation:
      "Prețul minus avansul dă suma împrumutată. Estimarea folosește rate lunare egale și dobândă nominală constantă. Pentru o ofertă cu dobândă fixă urmată de dobândă variabilă, poți rula separat câte un scenariu pentru fiecare valoare a dobânzii.",
    note: "Rezultatul include principalul și dobânda. Pentru bugetul complet, folosește și comisioanele și asigurările din oferta băncii.",
  },
  {
    slug: "pret-metru-patrat-apartament",
    title: "Calculator de preț pe metru pătrat pentru un apartament",
    seoTitle: "Preț pe metru pătrat apartament | Calculator",
    description:
      "Calculează prețul pe m² din prețul apartamentului și suprafața utilă. Adaugă o a doua ofertă ca să vezi diferența.",
    intro:
      "Două apartamente la același preț pot avea suprafețe diferite. Calculează prețul pe m² pentru o ofertă sau compară două apartamente după suprafața utilă.",
    explanationTitle: "Ce suprafață folosești",
    explanation:
      "Împarte prețul cerut la suprafața utilă din documente. Pentru o comparație corectă, folosește aceeași monedă și aceeași definiție a suprafeței la ambele apartamente. Verifică dacă prețul include parcarea, boxa sau TVA, după caz.",
    note: "Rezultatul descrie ofertele pe care le introduci. Pentru o comparație mai bună, ia în calcul și etajul, compartimentarea, starea blocului și reparațiile necesare.",
  },
  {
    slug: "ce-apartament-imi-permit",
    title: "Ce apartament îmi permit?",
    seoTitle: "Ce apartament îmi permit? | Calculator de buget",
    description:
      "Pornește de la rata pe care o poți plăti, economii și avansul cerut de bancă. Estimează bugetul maxim pentru cumpărarea unui apartament.",
    intro:
      "Dacă ai o rată lunară cu care te simți confortabil, o poți folosi ca punct de plecare pentru căutare. Vezi ce preț se încadrează în bugetul tău după ce pui deoparte cheltuielile inițiale.",
    explanationTitle: "De unde vine prețul maxim estimat",
    explanation:
      "Din rata aleasă, perioada și dobânda introdusă estimăm creditul pe care îl susține rata. Din economii scădem cheltuielile și rezerva, apoi aplicăm procentul minim de avans pe care îl introduci. Prețul estimat respectă ambele limite.",
    note: "Banca îți confirmă suma finanțabilă după ce analizează veniturile, datoriile și proprietatea. Poți testa aici cu o rată mai mică dacă vrei să lași mai mult spațiu în bugetul lunar.",
  },
] as const;

export type BuyerToolSlug = (typeof buyerTools)[number]["slug"];

export function buyerToolPath(slug: BuyerToolSlug) {
  return `/instrumente/${slug}`;
}
