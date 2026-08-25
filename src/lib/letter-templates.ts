/**
 * Letter templates. Official correspondence is ALWAYS Dutch, regardless of
 * UI language (PRD §1.2). Merge fields use {{placeholder}} syntax.
 */
export type LetterTemplate = {
  key: string;
  nameKey: string; // i18n key for the template picker (UI only)
  subject: string; // Dutch
  body: string; // Dutch
};

const FOOTER = `Met vriendelijke groet,

{{bewindvoerderNaam}}
Frank Bewindvoering
Correspondentieadres: Postbus 000, 1000 AA Amsterdam (demo)`;

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    key: "aanschrijfbrief",
    nameKey: "letters.templates.aanschrijfbrief",
    subject:
      "Onderbewindstelling {{clientNaam}} — wijziging correspondentie- en betaaladres",
    body: `Geachte heer/mevrouw,

Bij beschikking van de rechtbank {{rechtbank}} d.d. {{beschikkingDatum}} (zaaknummer {{zaaknummer}}) zijn de goederen van

  {{clientNaam}}, geboren {{geboortedatum}}, wonende te {{woonplaats}}

onder bewind gesteld, met benoeming van Frank Bewindvoering tot bewindvoerder.

Ik verzoek u per direct:
1. alle correspondentie betreffende betrokkene uitsluitend te richten aan onderstaand correspondentieadres;
2. betalingen en incasso's te laten verlopen via de beheerrekening {{beheerIban}} ten name van betrokkene;
3. uw klant-/relatienummer(s) van betrokkene aan mij te bevestigen.

Een afschrift van de beschikking kan op verzoek worden toegezonden.

${FOOTER}`,
  },
  {
    key: "betalingsregeling",
    nameKey: "letters.templates.betalingsregeling",
    subject: "Voorstel betalingsregeling inzake {{clientNaam}} — {{kenmerk}}",
    body: `Geachte heer/mevrouw,

Als bewindvoerder van {{clientNaam}} stel ik namens betrokkene een betalingsregeling voor ter aflossing van de openstaande vordering met kenmerk {{kenmerk}}, groot {{bedrag}}.

Voorstel: {{maandbedrag}} per maand, te voldoen vanaf de eerstvolgende kalendermaand vanaf beheerrekening {{beheerIban}}, tot de vordering volledig is voldaan.

De financiële situatie van betrokkene laat op dit moment geen hoger bedrag toe; het voorstel is gebaseerd op het vastgestelde budgetplan. Graag ontvang ik binnen 14 dagen uw schriftelijke bevestiging.

${FOOTER}`,
  },
  {
    key: "beslagvrije_voet",
    nameKey: "letters.templates.beslagvrije_voet",
    subject:
      "Verzoek herberekening beslagvrije voet inzake {{clientNaam}} — {{kenmerk}}",
    body: `Geachte heer/mevrouw,

Als bewindvoerder van {{clientNaam}} verzoek ik u de gehanteerde beslagvrije voet in bovengenoemd dossier te herberekenen conform de Wet vereenvoudiging beslagvrije voet.

De huidige inhouding leidt tot een besteedbaar inkomen onder de wettelijke norm. Graag ontvang ik binnen 14 dagen uw herberekening en, waar van toepassing, terugbetaling van het te veel ingehouden bedrag naar beheerrekening {{beheerIban}}.

${FOOTER}`,
  },
  {
    key: "kwijtschelding",
    nameKey: "letters.templates.kwijtschelding",
    subject: "Verzoek kwijtschelding gemeentelijke belastingen — {{clientNaam}}",
    body: `Geachte heer/mevrouw,

Namens {{clientNaam}}, wiens goederen bij beschikking van {{beschikkingDatum}} onder bewind zijn gesteld, verzoek ik kwijtschelding van de aanslag gemeentelijke belastingen {{kenmerk}}.

Betrokkene heeft een inkomen op of onder bijstandsniveau en geen vermogen; een specificatie van inkomen en lasten volgens het budgetplan kan op verzoek worden aangeleverd.

${FOOTER}`,
  },
  {
    key: "deurwaarder_melding",
    nameKey: "letters.templates.deurwaarder_melding",
    subject: "Melding onderbewindstelling — {{clientNaam}} ({{kenmerk}})",
    body: `Geachte heer/mevrouw,

Hierbij meld ik u dat de goederen van {{clientNaam}} bij beschikking van de rechtbank {{rechtbank}} d.d. {{beschikkingDatum}} onder bewind zijn gesteld.

Ik verzoek u:
1. alle correspondentie in dit dossier voortaan aan ondergetekende te richten;
2. lopende incassomaatregelen te bevestigen, onder opgave van de actuele saldi;
3. de beslagvrije voet — indien van toepassing — te toetsen en te bevestigen.

${FOOTER}`,
  },
];

export function renderTemplate(
  tpl: { subject: string; body: string },
  fields: Record<string, string>
): { subject: string; body: string } {
  const sub = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => fields[k] ?? `[${k}]`);
  return { subject: sub(tpl.subject), body: sub(tpl.body) };
}
