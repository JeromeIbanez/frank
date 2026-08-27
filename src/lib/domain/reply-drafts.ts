/**
 * Drafting the reply — pure, no I/O (plan os-v2 §5, "the answer is knowable").
 *
 * The single biggest hour-saver in the office: curators write the same twenty
 * letters over and over. Frank writes the draft; a human reads, edits and
 * approves it. Sending is never an agent act (N2).
 *
 * DETERMINISTIC TEMPLATES, NOT GENERATION. A letter that disputes a statutory
 * cap has to state the arithmetic correctly, cite the right besluit, and say
 * only what the evidence supports. A generated paragraph that is 95% right is
 * a liability in correspondence a creditor may later put before a rechter, so
 * every number in these drafts comes from the finding that produced them and
 * nothing is phrased more strongly than the check allows.
 *
 * Always Dutch: this is official correspondence (product invariant).
 */

import { formatEuro } from "@/lib/domain/money";

export type WikDisputeInput = {
  creditorName: string;
  reference?: string;
  principalCents: number;
  chargedCostsCents: number;
  maximumCents: number;
  excessCents: number;
  clientName: string;
  sourceUrl: string;
};

export type ReplyDraft = {
  templateKey: string;
  subject: string;
  /** Always Dutch. */
  body: string;
};

/**
 * Betwisting van incassokosten boven het wettelijk maximum.
 *
 * Note what it does NOT say: it does not dispute the underlying debt, it does
 * not allege bad faith, and it does not refuse payment of the principal. The
 * check established exactly one thing — that the costs exceed the statutory
 * maximum for this principal — so the letter asserts exactly that, and offers
 * payment of the undisputed part, which is what actually resolves these.
 */
export function draftWikDispute(input: WikDisputeInput): ReplyDraft {
  const ref = input.reference ? ` (kenmerk ${input.reference})` : "";
  const correctTotal = input.principalCents + input.maximumCents;

  const body = [
    `Geachte heer/mevrouw,`,
    ``,
    `Namens ${input.clientName}, voor wie ik als bewindvoerder optreed, reageer ik`,
    `op uw bericht${ref}.`,
    ``,
    `De in rekening gebrachte buitengerechtelijke incassokosten van`,
    `${formatEuro(input.chargedCostsCents)} overschrijden het wettelijk maximum. Bij een`,
    `hoofdsom van ${formatEuro(input.principalCents)} bedraagt de maximale vergoeding`,
    `${formatEuro(input.maximumCents)} op grond van het Besluit vergoeding voor`,
    `buitengerechtelijke incassokosten. Het verschil bedraagt`,
    `${formatEuro(input.excessCents)}.`,
    ``,
    `Ik betwist uitsluitend dit deel van de vordering. De hoofdsom en de`,
    `incassokosten tot het wettelijk maximum, samen ${formatEuro(correctTotal)},`,
    `worden niet betwist.`,
    ``,
    `Ik verzoek u de vordering hierop aan te passen en mij een gecorrigeerde`,
    `specificatie te sturen. Na ontvangst daarvan zal ik de betaling in`,
    `behandeling nemen binnen de mogelijkheden van het bewind.`,
    ``,
    `Met vriendelijke groet,`,
    ``,
    `[naam bewindvoerder]`,
    `bewindvoerder`,
    ``,
    `---`,
    `Bron: ${input.sourceUrl}`,
  ].join("\n");

  return {
    templateKey: "wik_dispute",
    subject: `Betwisting incassokosten${ref} — ${input.clientName}`,
    body,
  };
}

export type InfoRequestInput = {
  senderName: string;
  reference?: string;
  clientName: string;
  dueDate?: string | null;
};

/**
 * Ontvangstbevestiging op een informatieverzoek.
 *
 * Deliberately does NOT promise the documents by a date, because Frank cannot
 * know whether the office can meet it. It confirms receipt and names the
 * deadline back — which is what stops these requests silently expiring.
 */
export function draftInfoRequestAck(input: InfoRequestInput): ReplyDraft {
  const ref = input.reference ? ` (kenmerk ${input.reference})` : "";
  const body = [
    `Geachte heer/mevrouw,`,
    ``,
    `Hierbij bevestig ik de ontvangst van uw verzoek${ref} betreffende`,
    `${input.clientName}, voor wie ik als bewindvoerder optreed.`,
    ``,
    input.dueDate
      ? `Ik heb genoteerd dat u de gevraagde stukken uiterlijk ${input.dueDate}`
      : `Ik heb uw verzoek genoteerd en`,
    input.dueDate
      ? `wenst te ontvangen. Ik zorg voor tijdige aanlevering.`
      : `zorg voor aanlevering van de gevraagde stukken.`,
    ``,
    `Mocht u aanvullende informatie nodig hebben, dan verneem ik dat graag.`,
    ``,
    `Met vriendelijke groet,`,
    ``,
    `[naam bewindvoerder]`,
    `bewindvoerder`,
  ].join("\n");

  return {
    templateKey: "info_request_ack",
    subject: `Ontvangstbevestiging${ref} — ${input.clientName}`,
    body,
  };
}
