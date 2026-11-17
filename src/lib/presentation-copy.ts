// Shared presentation copy applies to sample, preview and published pages,
// independently of headings stored by earlier versions of the writing service.
export const presentationCopy = {
  introduction: {
    title: "Proprietatea perfectă",
    accent: "pentru tine și familia ta",
  },
  gallery: {
    title: "Descoperă proprietatea.",
    accent: "Fotografii care reflectă realitatea",
  },
  heritageDetails: {
    label: "Detaliile care contează",
    title: "O locuință potrivită",
    accent: "pe termen lung",
  },
  heritageSetting: {
    title: "Mai aproape de",
    accent: "Locuința ta",
  },
  mortgage: {
    title: "Estimează bugetul cu ușurință:",
    subtitle:
      "Cunoaște ratele lunare, costul creditului și planul de rambursare pentru această locuință.",
  },
  agent: {
    title: "Comunică eficient cu agentul",
    editorialTitle: "Comunică eficient cu agentul imobiliar",
    subtitle: "Obține răspuns rapid la toate întrebările.",
  },
  neighbourhood: "Cunoaște zonele din apropiere",
  inquiry: {
    title: "Programează o vizionare",
    subtitle:
      "Completează acest formular pentru a programa o vizionare a proprietății.",
  },
  viewingSubtitle:
    "Completează detaliile de contact și alege o zi potrivită pentru vizionare. Revenim pentru a confirma ora și disponibilitatea.",
  invitation: {
    eyebrow: "Nu mai pierde timpul cu vizionări inutile",
    title: "Te așteptăm să înțelegi",
    accent: "cum arată această proprietate",
    note: "Alege o zi potrivită pentru tine. O locuință în care să te simți acasă.",
  },
} as const;

export function propertyInvitation(location: string) {
  const address = location.trim();
  return `Programează o vizionare a proprietății${address ? ` din ${address}` : ""} pentru a avea toate informațiile de care ai nevoie și a lua o decizie corectă.`;
}
