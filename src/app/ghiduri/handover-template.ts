export const handoverTemplate = {
  filePath: "/ghiduri/proces-verbal-predare-apartament.docx",
  title: "Proces-verbal de predare-primire a apartamentului",
  sections: [
    {
      title: "Părțile, adresa și data predării",
      fields: [
        "Data și ora: ________________________________________________________",
        "Adresa apartamentului: ______________________________________________",
        "Proprietar / reprezentant: ___________________________________________",
        "Chiriaș / reprezentant: ______________________________________________",
        "Contract de închiriere nr. __________ din data __________",
      ],
    },
    {
      title: "Chei și acces",
      fields: [
        "Chei apartament: ____  Chei spații comune: ____  Cartele / telecomenzi: ____",
        "Observații: __________________________________________________________",
      ],
    },
    {
      title: "Contoare",
      fields: [
        "Energie electrică — serie și index: ___________________________________",
        "Gaze — serie și index: _______________________________________________",
        "Apă rece — serie și index: ___________________________________________",
        "Apă caldă — serie și index: __________________________________________",
      ],
    },
    {
      title: "Inventar, stare și fotografii",
      fields: [
        "Cameră, obiect, cantitate și stare: ___________________________________",
        "______________________________________________________________________",
        "Defecte observate și fotografii anexate: ______________________________",
        "______________________________________________________________________",
      ],
    },
    {
      title: "Observații și semnături",
      fields: [
        "Observații, lucrări convenite și termen: ______________________________",
        "______________________________________________________________________",
        "Semnătură proprietar: _________________ Semnătură chiriaș: ____________",
      ],
    },
  ],
} as const;
