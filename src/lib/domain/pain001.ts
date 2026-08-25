/**
 * SEPA credit transfer pain.001.001.03 XML generator.
 *
 * Money invariants (PRD §6 M3): the generator validates everything up front
 * and returns `{ errors }` instead of ever producing a bad file. Amounts are
 * integer cents; CtrlSum is rendered as decimal euros with exactly 2
 * decimals, computed with integer arithmetic. All free-text fields are
 * XML-escaped. Note: file EXPORT is feature-flagged and demo-labeled at the
 * application layer — this module only builds valid XML.
 */

export type PaymentInstruction = {
  creditorName: string;
  creditorIban: string;
  amountCents: number;
  remittanceInfo: string | null;
  endToEndId: string;
};

/** IBAN mod-97 checksum validation (ISO 13616). */
export function isValidIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  // Move the first 4 chars to the end, then A=10..Z=35, mod 97 must be 1.
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? code - 55 : code - 48; // A-Z -> 10..35, 0-9 -> 0..9
    remainder = (remainder * (value >= 10 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Integer cents -> "1234.56" (decimal euros, exactly 2 decimals). */
function centsToDecimal(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${euros}.${rest}`;
}

export type PaymentGroup = {
  debtorName: string;
  debtorIban: string;
  instructions: PaymentInstruction[];
};

/**
 * Multi-debtor generator: one PmtInf block per debtor account (the normal
 * shape for a bewind office batch — each client's beheerrekening is its own
 * debtor). No silent caps: every group is validated and emitted, or the
 * whole call returns errors.
 */
export function generatePain001Multi(input: {
  messageId: string;
  creationDateTime: string; // ISO, injected
  initiatingParty: string;
  requestedExecutionDate: string; // ISO date
  groups: PaymentGroup[];
}): { xml: string; controlSumCents: number; count: number } | { errors: string[] } {
  const errors: string[] = [];

  if (input.messageId.trim().length === 0) errors.push("messageId is required.");
  if (input.creationDateTime.trim().length === 0) errors.push("creationDateTime is required.");
  if (input.initiatingParty.trim().length === 0) errors.push("initiatingParty is required.");

  if (input.requestedExecutionDate.trim().length === 0) {
    errors.push("requestedExecutionDate is required.");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.requestedExecutionDate)) {
    errors.push(`requestedExecutionDate is not an ISO date: ${input.requestedExecutionDate}`);
  }

  if (input.groups.length === 0) {
    errors.push("At least one payment group is required.");
  }

  input.groups.forEach((group, g) => {
    const gLabel = `Group ${g + 1} (${group.debtorIban || "no debtor IBAN"})`;
    if (group.debtorName.trim().length === 0) errors.push(`${gLabel}: debtorName is required.`);
    if (!isValidIban(group.debtorIban)) {
      errors.push(`${gLabel}: invalid debtor IBAN: ${group.debtorIban}`);
    }
    if (group.instructions.length === 0) {
      errors.push(`${gLabel}: at least one payment instruction is required.`);
    }
    group.instructions.forEach((instr, i) => {
      const label = `${gLabel}, instruction ${i + 1} (${instr.endToEndId || "no endToEndId"})`;
      if (!Number.isInteger(instr.amountCents) || instr.amountCents <= 0) {
        errors.push(`${label}: amount must be a positive integer number of cents.`);
      }
      if (!isValidIban(instr.creditorIban)) {
        errors.push(`${label}: invalid creditor IBAN: ${instr.creditorIban}`);
      }
      if (instr.creditorName.trim().length === 0) {
        errors.push(`${label}: creditorName is required.`);
      }
      if (instr.endToEndId.trim().length === 0) {
        errors.push(`${label}: endToEndId is required.`);
      }
    });
  });

  if (errors.length > 0) return { errors };

  const allInstructions = input.groups.flatMap((g) => g.instructions);
  const controlSumCents = allInstructions.reduce((sum, i) => sum + i.amountCents, 0);
  const count = allInstructions.length;

  const pmtInfBlocks = input.groups
    .map((group, g) => {
      const groupSum = centsToDecimal(
        group.instructions.reduce((sum, i) => sum + i.amountCents, 0)
      );
      const txBlocks = group.instructions
        .map((instr) => {
          const rmt =
            instr.remittanceInfo !== null && instr.remittanceInfo.trim().length > 0
              ? `
        <RmtInf>
          <Ustrd>${escapeXml(instr.remittanceInfo)}</Ustrd>
        </RmtInf>`
              : "";
          return `
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(instr.endToEndId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${centsToDecimal(instr.amountCents)}</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>${escapeXml(instr.creditorName)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${instr.creditorIban.replace(/\s+/g, "").toUpperCase()}</IBAN>
          </Id>
        </CdtrAcct>${rmt}
      </CdtTrfTxInf>`;
        })
        .join("");
      return `
    <PmtInf>
      <PmtInfId>${escapeXml(input.messageId)}-${g + 1}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${group.instructions.length}</NbOfTxs>
      <CtrlSum>${groupSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${escapeXml(input.requestedExecutionDate)}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(group.debtorName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${group.debtorIban.replace(/\s+/g, "").toUpperCase()}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${txBlocks}
    </PmtInf>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(input.messageId)}</MsgId>
      <CreDtTm>${escapeXml(input.creationDateTime)}</CreDtTm>
      <NbOfTxs>${count}</NbOfTxs>
      <CtrlSum>${centsToDecimal(controlSumCents)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(input.initiatingParty)}</Nm>
      </InitgPty>
    </GrpHdr>${pmtInfBlocks}
  </CstmrCdtTrfInitn>
</Document>
`;

  return { xml, controlSumCents, count };
}

export function generatePain001(input: {
  messageId: string;
  creationDateTime: string; // ISO, injected
  initiatingParty: string;
  debtorName: string;
  debtorIban: string;
  requestedExecutionDate: string; // ISO date
  instructions: PaymentInstruction[];
}): { xml: string; controlSumCents: number; count: number } | { errors: string[] } {
  return generatePain001Multi({
    messageId: input.messageId,
    creationDateTime: input.creationDateTime,
    initiatingParty: input.initiatingParty,
    requestedExecutionDate: input.requestedExecutionDate,
    groups: [
      {
        debtorName: input.debtorName,
        debtorIban: input.debtorIban,
        instructions: input.instructions,
      },
    ],
  });
}
