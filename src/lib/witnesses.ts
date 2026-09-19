export const witnesses = [
  { tpsNumber: 1, name: "Jaja Abdul Rahman" },
  { tpsNumber: 2, name: "Cahyadi Anta Saputra" },
  { tpsNumber: 3, name: "Handi" },
  { tpsNumber: 4, name: "Asep Sopian" },
  { tpsNumber: 5, name: "Otib Andriana" },
  { tpsNumber: 6, name: "Junaedi" },
  { tpsNumber: 7, name: "Jamil MH" },
  { tpsNumber: 8, name: "Rachmad Andriyanto" },
  { tpsNumber: 9, name: "Rosid" },
  { tpsNumber: 10, name: "Egi Junaedi" },
  { tpsNumber: 11, name: "Eko Setiya" },
  { tpsNumber: 12, name: "Indra" },
  { tpsNumber: 13, name: "Asep Saepudin" },
  { tpsNumber: 14, name: "Suseno" },
  { tpsNumber: 15, name: "Yati Suryati" },
  { tpsNumber: 16, name: "Fawaz Firzatullah" },
  { tpsNumber: 17, name: "Rusdianto" },
  { tpsNumber: 18, name: "Elpin" },
  { tpsNumber: 19, name: "Saidi" },
  { tpsNumber: 20, name: "Maman Hariana" },
  { tpsNumber: 21, name: "Taufik Ibrahim" },
] as const;

export function getWitnessName(tpsNumber: number) {
  return witnesses.find((witness) => witness.tpsNumber === tpsNumber)?.name ?? "Petugas TPS";
}
