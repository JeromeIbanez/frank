/**
 * Playbooks: workflow templates that instantiate tasks with correct tiers.
 * The "nieuw dossier" playbook is the ~25-step start sequence from the
 * operations research, condensed to its MVP-demonstrable core.
 */
export type PlaybookTaskDef = {
  key: string;
  titleKey: string; // i18n: playbooks.<key>
  tier: "T1" | "T2" | "T3" | "internal";
  offsetDays: number; // due = startDate + offset
  checklist?: { key: string; labelKey: string }[];
};

export const NIEUW_DOSSIER_PLAYBOOK: PlaybookTaskDef[] = [
  {
    key: "open_bankrekeningen",
    titleKey: "playbooks.open_bankrekeningen",
    tier: "T2",
    offsetDays: 3,
    checklist: [
      { key: "beheer", labelKey: "playbooks.check.beheerrekening" },
      { key: "leefgeld", labelKey: "playbooks.check.leefgeldrekening" },
      { key: "blokkeren", labelKey: "playbooks.check.oude_passen" },
    ],
  },
  {
    key: "aanschrijven_instanties",
    titleKey: "playbooks.aanschrijven_instanties",
    tier: "T3",
    offsetDays: 7,
  },
  {
    key: "budgetplan_opstellen",
    titleKey: "playbooks.budgetplan_opstellen",
    tier: "internal",
    offsetDays: 14,
  },
  {
    key: "toeslagen_check",
    titleKey: "playbooks.toeslagen_check",
    tier: "T2",
    offsetDays: 21,
    checklist: [
      { key: "huurtoeslag", labelKey: "playbooks.check.huurtoeslag" },
      { key: "zorgtoeslag", labelKey: "playbooks.check.zorgtoeslag" },
      { key: "kgb", labelKey: "playbooks.check.kindgebonden" },
    ],
  },
  {
    key: "bijzondere_bijstand",
    titleKey: "playbooks.bijzondere_bijstand",
    tier: "T2",
    offsetDays: 30,
  },
  {
    key: "kwijtschelding",
    titleKey: "playbooks.kwijtschelding",
    tier: "T2",
    offsetDays: 45,
  },
  {
    key: "schulden_inventarisatie",
    titleKey: "playbooks.schulden_inventarisatie",
    tier: "T3",
    offsetDays: 30,
  },
  {
    key: "leefgeld_instellen",
    titleKey: "playbooks.leefgeld_instellen",
    tier: "internal",
    offsetDays: 7,
  },
];

/** Default instantie contact set created with each new dossier. */
export const DEFAULT_INSTANTIES: { kind: string; name: string }[] = [
  { kind: "belastingdienst", name: "Belastingdienst / Toeslagen" },
  { kind: "gemeente", name: "Gemeente (uitkering & belastingen)" },
  { kind: "uwv", name: "UWV" },
  { kind: "svb", name: "Sociale Verzekeringsbank" },
  { kind: "zorgverzekeraar", name: "Zorgverzekeraar" },
  { kind: "energie", name: "Energieleverancier" },
  { kind: "woningcorporatie", name: "Woningcorporatie / verhuurder" },
  { kind: "cak", name: "CAK" },
  { kind: "waterschap", name: "Waterschap" },
];
