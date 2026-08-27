/**
 * The question we put to the client — pure, no I/O (plan os-v2 §6 step 2).
 *
 * THIS IS THE MOST DELICATE TEXT IN THE PRODUCT
 * ---------------------------------------------
 * A safeguarding case is Frank noticing something about a vulnerable adult's
 * money. The message that follows can land as "your bewindvoerder is checking
 * on you because they think something is wrong", which damages a relationship
 * the client depends on, or as "we noticed something and want to make sure we
 * have it right", which is what it actually is.
 *
 * Rules encoded here, not left to the drafter:
 *   1. NEVER the word fraude, and never an allegation (N4). The message asks;
 *      it does not conclude, warn, or imply the client must explain
 *      themselves to keep their money.
 *   2. B1 Dutch. Short sentences, everyday words, no jargon and no legal
 *      register. The audience includes people with cognitive impairments,
 *      limited literacy, and Dutch as a second language.
 *   3. SAY WHY WE ASK. A question with no reason reads as surveillance. Every
 *      message states plainly what we saw and that checking is part of our
 *      job.
 *   4. THE CLIENT'S MONEY IS THEIRS. Nothing implies they need permission to
 *      spend it. Under bewind the bewindvoerder administers; the client
 *      remains an adult with their own life.
 *   5. NO EASY ANSWER REQUIRED. Every message offers "ik weet het niet meer"
 *      as an acceptable reply, because not remembering is normal and a
 *      message that punishes it produces false reassurance.
 *
 * A human approves every one of these before it goes anywhere (N2).
 */

import { formatEuro } from "@/lib/domain/money";

export type ClarificationDraft = {
  readonly detectorKey: string;
  readonly subject: string;
  /** Always Dutch, B1 register. */
  readonly body: string;
};

const OPENING = (clientFirstName: string) =>
  `Beste ${clientFirstName},`;

const WHY_WE_ASK =
  "Wij kijken elke maand naar de rekening. Dat hoort bij ons werk als " +
  "bewindvoerder. Meestal is alles gewoon goed. Soms zien wij iets waarvan " +
  "wij het verhaal niet kennen. Dan vragen wij het u.";

const CLOSING =
  "Weet u het niet meer? Dat is niet erg. Zegt u dan gerust dat u het niet " +
  "meer weet.\n\n" +
  "Het is uw geld. U hoeft geen toestemming te vragen om het uit te geven. " +
  "Wij willen alleen zeker weten dat er niets mis is gegaan.\n\n" +
  "Met vriendelijke groet,\n\n" +
  "[naam bewindvoerder]";

function compose(
  clientFirstName: string,
  subject: string,
  observation: string,
  question: string
): { subject: string; body: string } {
  return {
    subject,
    body: [
      OPENING(clientFirstName),
      "",
      WHY_WE_ASK,
      "",
      observation,
      "",
      question,
      "",
      CLOSING,
    ].join("\n"),
  };
}

export type ClarificationInput = {
  readonly detectorKey: string;
  readonly clientFirstName: string;
  readonly evidence: Record<string, unknown>;
};

function euro(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? formatEuro(Math.abs(n)) : "";
}

/**
 * Build the question for a case, or return null when this detector has no
 * client-facing question.
 *
 * Office-scope detectors return null by construction: you do not ask a client
 * to explain their bewindvoerder's conduct.
 */
export function draftClarification(
  input: ClarificationInput
): ClarificationDraft | null {
  const n = input.clientFirstName;
  const e = input.evidence;

  switch (input.detectorKey) {
    case "cash_withdrawal_spike": {
      const { subject, body } = compose(
        n,
        "Een vraag over geld opnemen",
        `In de afgelopen weken is er ${euro(e.recentTotalCents)} contant ` +
          `opgenomen. Dat is meer dan u meestal opneemt.`,
        "Weet u waar dit geld aan is uitgegeven? En heeft iemand u gevraagd " +
          "om dit geld op te nemen?"
      );
      return { detectorKey: input.detectorKey, subject, body };
    }

    case "structuring": {
      const { subject, body } = compose(
        n,
        "Een vraag over geld opnemen",
        `Er is een aantal keer vlak achter elkaar bijna hetzelfde bedrag ` +
          `opgenomen.`,
        "Weet u waarom dit zo is gegaan? Heeft iemand u gevraagd om het op " +
          "deze manier te doen?"
      );
      return { detectorKey: input.detectorKey, subject, body };
    }

    case "rapid_in_out": {
      const { subject, body } = compose(
        n,
        "Een vraag over een bedrag op uw rekening",
        `Er kwam ${euro(e.creditCents)} binnen op de rekening. Kort daarna ` +
          `ging bijna hetzelfde bedrag er weer af.`,
        "Weet u van wie dit geld kwam en waar het daarna naartoe is gegaan?"
      );
      return { detectorKey: input.detectorKey, subject, body };
    }

    case "new_payee_high_value": {
      const { subject, body } = compose(
        n,
        "Een vraag over een betaling",
        `Er is ${euro(e.amountCents)} betaald aan ${String(e.counterparty || "iemand")}. ` +
          `Dat is de eerste keer dat wij deze naam zien.`,
        "Kent u deze naam? En weet u waar deze betaling voor was?"
      );
      return { detectorKey: input.detectorKey, subject, body };
    }

    case "high_risk_merchant": {
      // The gentlest of the set on purpose: how someone spends their own
      // money is their business, and the only real risk we are helping with
      // is money running out before the month does.
      const { subject, body } = compose(
        n,
        "Een vraag over een betaling",
        `Wij zagen een betaling aan ${String(e.merchant || "een bedrijf")}.`,
        "Wij vragen dit alleen om te weten of het geld deze maand toereikend " +
          "blijft. Lukt het u om rond te komen? Wilt u dat wij meekijken?"
      );
      return { detectorKey: input.detectorKey, subject, body };
    }

    case "leefgeld_diversion": {
      const { subject, body } = compose(
        n,
        "Een vraag over uw leefgeld",
        `Uw leefgeld was kort na binnenkomst bijna helemaal weg.`,
        "Weet u waar dit geld naartoe is gegaan? En heeft iemand u gevraagd " +
          "om dit geld over te maken?"
      );
      return { detectorKey: input.detectorKey, subject, body };
    }

    case "direct_debit_without_recorded_mandate": {
      const { subject, body } = compose(
        n,
        "Een vraag over een automatische incasso",
        `${String(e.counterparty || "Een bedrijf")} haalt geld van de rekening ` +
          `af met een automatische incasso. Wij hebben daar geen afspraak van ` +
          `in ons dossier.`,
        "Weet u of u hiervoor iets heeft getekend of afgesproken?"
      );
      return { detectorKey: input.detectorKey, subject, body };
    }

    case "beneficiary_name_mismatch":
      // A verification question for the CREDITOR, not the client — the client
      // has no way to know whose account number a company uses.
      return null;

    default:
      return null;
  }
}

/** Detectors that never produce a client-facing question. */
export function hasClientQuestion(detectorKey: string): boolean {
  return (
    draftClarification({
      detectorKey,
      clientFirstName: "X",
      evidence: {},
    }) !== null
  );
}
