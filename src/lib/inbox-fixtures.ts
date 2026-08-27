/**
 * The SIMULATED mailbox (plan os-v2 N6).
 *
 * There is no real mailbox, no IMAP, no bank feed and no client contact in
 * this build. "Ontvang post" replays these synthetic messages so the whole
 * motion — arrive, route, read, check, draft — is demonstrable end to end.
 *
 * The `channels` table carries an `adapter` column so a real adapter is a new
 * value rather than a schema change, and the UI says out loud that this one
 * is simulated.
 *
 * Fixtures are written against the SEEDED dossiers, so they resolve through
 * the real matchers (IBAN, debt reference) rather than being handed a dossier
 * id. If resolution regresses, the demo visibly breaks — which is the point.
 */

export type InboxFixture = {
  externalId: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  /** Days before "now", so the mailbox always looks freshly delivered. */
  receivedDaysAgo: number;
  body: string;
};

export const INBOX_FIXTURES: InboxFixture[] = [
  {
    // Resolves to Dennis Smit via debt reference REF-SAN-1006 + IBAN.
    // Collection costs are a GENUINE overcharge: on a €412,30 principal the
    // statutory maximum is €61,85 (15%, half-up), and €75,00 is charged.
    // The excess of €13,15 is far clear of the €1 de-minimis.
    externalId: "sim-2026-08-001",
    fromName: "Santander Consumer Finance",
    fromAddress: "incasso@santanderconsumer.nl",
    subject: "Aanmaning openstaande vordering — kenmerk REF-SAN-1006",
    receivedDaysAgo: 1,
    body: [
      "Geachte heer/mevrouw,",
      "",
      "Ondanks eerdere berichten staat onderstaand bedrag nog open.",
      "",
      "Ons kenmerk: REF-SAN-1006",
      "Hoofdsom: € 412,30",
      "Incassokosten: € 75,00",
      "Totaal te voldoen: € 487,30",
      "Uiterlijk: 10-09-2026",
      "",
      "Betaling kunt u overmaken onder vermelding van het kenmerk.",
      "Tegenrekening cliënt bij ons bekend: NL22ABNA0417164184",
      "",
      "Met vriendelijke groet,",
      "Afdeling Incasso",
    ].join("\n"),
  },
  {
    // Resolves to Sandra Vermeulen via REF-VAT-1003 + IBAN. Routine: no
    // finding fires, and that is the correct outcome for most post.
    externalId: "sim-2026-08-002",
    fromName: "Gemeente Rotterdam — Team Schuldhulpverlening",
    fromAddress: "schuldhulp@rotterdam.nl",
    subject: "Verzoek om informatie — aanvraag bijzondere bijstand",
    receivedDaysAgo: 2,
    body: [
      "Geachte bewindvoerder,",
      "",
      "Voor de beoordeling van de aanvraag verzoeken wij u de volgende",
      "stukken aan te leveren: recente bankafschriften van drie maanden en",
      "een actueel schuldenoverzicht.",
      "",
      "Kenmerk: REF-VAT-1003",
      "Rekening waarop de aanvraag betrekking heeft: NL89ABNA0417164142",
      "Uiterlijk: 2026-09-15",
      "",
      "Met vriendelijke groet,",
      "Team Schuldhulpverlening",
    ].join("\n"),
  },
  {
    // Deliberately unroutable: a real name, and nothing else. Proves the
    // system refuses to guess and asks a human instead — the failure mode
    // that puts one client's letter in another client's file.
    externalId: "sim-2026-08-003",
    fromName: "Deurwaarderskantoor Van Es",
    fromAddress: "post@vanes-gdw.nl",
    subject: "Betreft: openstaande vordering",
    receivedDaysAgo: 0,
    body: [
      "Geachte heer/mevrouw,",
      "",
      "Wij treden op namens onze opdrachtgever inzake een openstaande",
      "vordering. Wij verzoeken u contact met ons op te nemen.",
      "",
      "Met vriendelijke groet,",
      "Deurwaarderskantoor Van Es",
    ].join("\n"),
  },
];
