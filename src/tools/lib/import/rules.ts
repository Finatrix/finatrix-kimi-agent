/**
 * The built-in merchant table: one entry answers both "what is this called?"
 * and "which category is it?".
 *
 * WHY A TABLE AT ALL, GIVEN THERE IS A MODEL
 * ------------------------------------------
 * Because most of a statement is the same forty merchants every month. Resolving
 * those here means a typical import sends a fraction of its rows to the model,
 * which makes the feature fast, cheap enough to sit inside the shared daily
 * token budget, and — for the rows it covers — deterministic, so the same
 * statement imported twice categorises identically. The model is then spent on
 * the genuinely unknown descriptions, which is where it is actually better than
 * a table.
 *
 * Categories are Budget Builder's built-in keys (see `lib/budget.ts`). They are
 * validated against the user's *live* set before use — someone who deleted
 * "Gifts" must never have a row assigned to it — so a key here is a proposal,
 * not an instruction.
 *
 * India-first, matching the product: UPI rails, Indian brands and the
 * transaction prefixes Indian banks print, followed by the global names that
 * appear on any statement. Ordered most-specific first; the first match wins.
 */


export interface MerchantRule {
  /** Matched against the upper-cased description. */
  match: RegExp;
  /** Canonical display name for the payee. */
  merchant: string;
  /** Budget Builder category key, or null when the name is known but the spend is not. */
  category: string | null;
}

/**
 * Recognised payees.
 *
 * A brand earns a row here when its descriptor is stable and its category is
 * unambiguous. Anything that could plausibly be two categories (a supermarket
 * that is also a pharmacy, a marketplace that sells everything) is given a name
 * and a `null` category so the row is still labelled but the bucket is left to
 * the model or the user — a wrong category assigned confidently is worse than
 * no category at all.
 */
export const MERCHANT_RULES: readonly MerchantRule[] = [
  /* ── Food delivery & dining ── */
  { match: /\bSWIGGY\s*(?:INSTAMART|IM)\b/, merchant: 'Swiggy Instamart', category: 'groceries' },
  { match: /\bSWIGGY\b/, merchant: 'Swiggy', category: 'eating_out' },
  { match: /\bZOMATO\b/, merchant: 'Zomato', category: 'eating_out' },
  { match: /\bUBER\s*EATS\b|\bUBEREATS\b/, merchant: 'Uber Eats', category: 'eating_out' },
  { match: /\bDOMINO/, merchant: "Domino's Pizza", category: 'eating_out' },
  { match: /\bMCDONALD|\bMCD\b/, merchant: "McDonald's", category: 'eating_out' },
  { match: /\bSTARBUCKS\b/, merchant: 'Starbucks', category: 'eating_out' },
  { match: /\bCAFE\s*COFFEE\s*DAY\b|\bCCD\b/, merchant: 'Café Coffee Day', category: 'eating_out' },
  { match: /\bDUNKIN|\bKFC\b|\bBURGER\s*KING\b|\bSUBWAY\b|\bPIZZA\s*HUT\b/, merchant: '', category: 'eating_out' },
  { match: /\bDOORDASH\b/, merchant: 'DoorDash', category: 'eating_out' },
  { match: /\bDELIVEROO\b/, merchant: 'Deliveroo', category: 'eating_out' },

  /* ── Groceries ── */
  { match: /\bBIG\s*BASKET\b|\bBIGBASKET\b/, merchant: 'BigBasket', category: 'groceries' },
  { match: /\bBLINKIT\b|\bGROFERS\b/, merchant: 'Blinkit', category: 'groceries' },
  { match: /\bZEPTO\b/, merchant: 'Zepto', category: 'groceries' },
  { match: /\bDMART\b|\bD\s*MART\b|\bAVENUE\s*SUPERMART/, merchant: 'DMart', category: 'groceries' },
  { match: /\bRELIANCE\s*(?:FRESH|SMART)\b/, merchant: 'Reliance Fresh', category: 'groceries' },
  { match: /\bWOOLWORTHS\b/, merchant: 'Woolworths', category: 'groceries' },
  { match: /\bCOLES\b/, merchant: 'Coles', category: 'groceries' },
  { match: /\bALDI\b/, merchant: 'Aldi', category: 'groceries' },
  { match: /\bTESCO\b|\bSAINSBURY|\bWAITROSE\b|\bASDA\b/, merchant: '', category: 'groceries' },
  { match: /\bWHOLE\s*FOODS\b|\bTRADER\s*JOE/, merchant: '', category: 'groceries' },

  /* ── Transport & fuel ── */
  { match: /\bUBER\b/, merchant: 'Uber', category: 'transport' },
  { match: /\bOLA\s*(?:CABS|MONEY)?\b/, merchant: 'Ola', category: 'transport' },
  { match: /\bRAPIDO\b/, merchant: 'Rapido', category: 'transport' },
  { match: /\bLYFT\b/, merchant: 'Lyft', category: 'transport' },
  { match: /\bIRCTC\b|\bINDIAN\s*RAIL/, merchant: 'IRCTC', category: 'transport' },
  { match: /\bFASTAG\b|\bNETC\b|\bTOLL\b/, merchant: 'FASTag', category: 'transport' },
  { match: /\bMETRO\s*RAIL\b|\bDMRC\b|\bBMRCL\b/, merchant: 'Metro', category: 'transport' },
  { match: /\bINDIAN\s*OIL\b|\bIOCL\b|\bBHARAT\s*PETRO|\bBPCL\b|\bHP\s*PETRO|\bHPCL\b/, merchant: '', category: 'transport' },
  { match: /\bSHELL\b|\bBP\s*CONNECT\b|\bCALTEX\b|\bAMPOL\b/, merchant: '', category: 'transport' },

  /* ── Shopping ── */
  { match: /\bAMZN\b|\bAMAZON\b/, merchant: 'Amazon', category: null },
  { match: /\bFLIPKART\b/, merchant: 'Flipkart', category: null },
  { match: /\bMYNTRA\b/, merchant: 'Myntra', category: 'shopping' },
  { match: /\bAJIO\b/, merchant: 'Ajio', category: 'shopping' },
  { match: /\bNYKAA\b/, merchant: 'Nykaa', category: 'personal_care' },
  { match: /\bIKEA\b/, merchant: 'IKEA', category: 'shopping' },
  { match: /\bDECATHLON\b/, merchant: 'Decathlon', category: 'shopping' },
  { match: /\bH\s*&\s*M\b|\bZARA\b|\bUNIQLO\b/, merchant: '', category: 'shopping' },
  { match: /\bEBAY\b|\bETSY\b|\bALIEXPRESS\b/, merchant: '', category: 'shopping' },

  /* ── Subscriptions & entertainment ── */
  { match: /\bNETFLIX\b/, merchant: 'Netflix', category: 'subscriptions' },
  { match: /\bSPOTIFY\b/, merchant: 'Spotify', category: 'subscriptions' },
  { match: /\bHOTSTAR\b|\bDISNEY/, merchant: 'Disney+ Hotstar', category: 'subscriptions' },
  { match: /\bPRIME\s*VIDEO\b|\bAMAZON\s*PRIME\b/, merchant: 'Amazon Prime', category: 'subscriptions' },
  { match: /\bYOUTUBE\s*PREMIUM\b|\bGOOGLE\s*YOUTUBE\b/, merchant: 'YouTube Premium', category: 'subscriptions' },
  { match: /\bAPPLE\.COM\/BILL\b|\bITUNES\b|\bICLOUD\b/, merchant: 'Apple', category: 'subscriptions' },
  { match: /\bGOOGLE\s*(?:ONE|STORAGE)\b/, merchant: 'Google One', category: 'subscriptions' },
  { match: /\bSONYLIV\b|\bZEE5\b|\bJIOCINEMA\b|\bJIOHOTSTAR\b/, merchant: '', category: 'subscriptions' },
  { match: /\bBOOKMYSHOW\b|\bBMS\s*TICKET/, merchant: 'BookMyShow', category: 'entertainment' },
  { match: /\bPVR\b|\bINOX\b|\bCINEPOLIS\b/, merchant: '', category: 'entertainment' },
  { match: /\bSTEAM\s*(?:GAMES|PURCHASE)?\b|\bSTEAMGAMES\b/, merchant: 'Steam', category: 'entertainment' },
  { match: /\bPLAYSTATION\b|\bXBOX\b|\bNINTENDO\b/, merchant: '', category: 'entertainment' },

  /* ── Utilities, phone & internet ── */
  { match: /\bAIRTEL\b/, merchant: 'Airtel', category: 'phone' },
  { match: /\bJIO\b|\bRELIANCE\s*JIO\b/, merchant: 'Jio', category: 'phone' },
  { match: /\bVODAFONE\b|\bVI\s*RECHARGE\b|\bIDEA\s*CELL/, merchant: 'Vi', category: 'phone' },
  { match: /\bBSNL\b/, merchant: 'BSNL', category: 'phone' },
  { match: /\bACT\s*FIBER|\bHATHWAY\b|\bTIKONA\b|\bEXCITEL\b/, merchant: '', category: 'internet' },
  { match: /\bTELSTRA\b|\bOPTUS\b|\bVERIZON\b|\bAT&T\b/, merchant: '', category: 'phone' },
  { match: /\bELECTRICITY\b|\bBESCOM\b|\bMSEDCL\b|\bTATA\s*POWER\b|\bADANI\s*ELEC/, merchant: '', category: 'utilities' },
  { match: /\bGAS\s*BILL\b|\bINDANE\b|\bHP\s*GAS\b|\bMAHANAGAR\s*GAS\b/, merchant: '', category: 'utilities' },
  { match: /\bWATER\s*(?:BILL|BOARD)\b|\bBWSSB\b/, merchant: '', category: 'utilities' },

  /* ── Health & care ── */
  { match: /\bAPOLLO\s*(?:PHARM|HOSP)/, merchant: 'Apollo', category: 'medical' },
  { match: /\b1MG\b|\bTATA\s*1MG\b|\bPHARMEASY\b|\bNETMEDS\b/, merchant: '', category: 'medical' },
  { match: /\bPRACTO\b|\bCHEMIST\b|\bPHARMACY\b|\bMEDICAL\s*STORE\b/, merchant: '', category: 'medical' },
  { match: /\bCULT\s*FIT\b|\bCULTFIT\b|\bGOLDS\s*GYM\b|\bGYM\b/, merchant: '', category: 'personal_care' },
  { match: /\bURBAN\s*(?:CLAP|COMPANY)\b/, merchant: 'Urban Company', category: 'personal_care' },

  /* ── Travel ── */
  { match: /\bMAKEMYTRIP\b|\bMMT\b/, merchant: 'MakeMyTrip', category: 'travel' },
  { match: /\bGOIBIBO\b|\bCLEARTRIP\b|\bEASEMYTRIP\b|\bIXIGO\b/, merchant: '', category: 'travel' },
  { match: /\bAIRBNB\b/, merchant: 'Airbnb', category: 'travel' },
  { match: /\bBOOKING\.COM\b|\bAGODA\b|\bEXPEDIA\b|\bOYO\b/, merchant: '', category: 'travel' },
  { match: /\bINDIGO\b|\b6E\b|\bAIR\s*INDIA\b|\bVISTARA\b|\bSPICEJET\b|\bAKASA\b/, merchant: '', category: 'travel' },
  { match: /\bQANTAS\b|\bJETSTAR\b|\bEMIRATES\b|\bSINGAPORE\s*AIR/, merchant: '', category: 'travel' },

  /* ── Insurance ── */
  { match: /\bLIC\b|\bLIFE\s*INSURANCE\b/, merchant: 'LIC', category: 'insurance' },
  { match: /\bINSURANCE\b|\bPOLICYBAZAAR\b|\bHDFC\s*ERGO\b|\bICICI\s*LOMBARD\b|\bSTAR\s*HEALTH\b/, merchant: '', category: 'insurance' },

  /* ── Rent ── */
  { match: /\bRENT\b|\bNOBROKER\b|\bLANDLORD\b|\bHOUSE\s*RENT\b/, merchant: '', category: 'rent' },

  /* ── Savings / investment / transfers ── */
  { match: /\bZERODHA\b|\bGROWW\b|\bUPSTOX\b|\bANGEL\s*ONE\b|\bKUVERA\b/, merchant: '', category: 'stocks' },
  { match: /\bSIP\b|\bMUTUAL\s*FUND\b|\bMF\s*PURCHASE\b|\bBSE\s*STAR\s*MF\b/, merchant: '', category: 'stocks' },
  { match: /\bPPF\b|\bNPS\b|\bEPF\b|\bSUKANYA\b/, merchant: '', category: 'emergency' },
  { match: /\bSGB\b|\bSOVEREIGN\s*GOLD\b|\bDIGITAL\s*GOLD\b/, merchant: '', category: 'gold' },
  { match: /\bSELF\s*TRANSFER\b|\bOWN\s*ACCOUNT\b|\bSWEEP\s*(?:IN|OUT)\b/, merchant: '', category: 'transfers' },

  /* ── Education ── */
  { match: /\bUDEMY\b|\bCOURSERA\b|\bUNACADEMY\b|\bBYJU|\bSCHOOL\s*FEE|\bCOLLEGE\s*FEE|\bTUITION\b/, merchant: '', category: 'self_invest' },
];

/**
 * Transaction-type words banks print around the payee. Stripped when deriving a
 * merchant name, and — critically — never allowed to *be* the merchant: a table
 * that answered "UPI" for a third of a statement would look like it worked while
 * telling the user nothing.
 */
export const RAIL_TOKENS = new Set([
  'UPI', 'POS', 'ATM', 'ATW', 'NWD', 'NEFT', 'IMPS', 'RTGS', 'ECS', 'ACH', 'NACH',
  'CHQ', 'CHEQUE', 'TFR', 'TRF', 'SI', 'EMI', 'INT', 'MPS', 'VPS', 'VIN', 'ECOM',
  'BIL', 'BPAY', 'DD', 'DR', 'CR', 'DEBIT', 'CREDIT', 'CARD', 'PAYMENT', 'PAYMT',
  'PURCHASE', 'TXN', 'TRANSACTION', 'REF', 'RRN', 'UTR', 'BY', 'TO', 'FROM', 'VIA',
  'PAID', 'RECEIVED', 'WDL', 'WITHDRAWAL', 'DEPOSIT', 'TRANSFER', 'AUTOPAY', 'MANDATE',
]);

/**
 * Descriptions that mean "money moved between the user's own pockets" rather
 * than a purchase. Matched against the whole description; a hit both suggests a
 * category and tells the review sheet not to treat the row as spending.
 */
export const INTERNAL_MOVEMENT_RE =
  /\b(?:SELF|OWN\s*ACCOUNT|SWEEP|CREDIT\s*CARD\s*(?:PAYMENT|BILL)|CC\s*PAYMENT|LOAN\s*REPAY|EMI\b)/;

/** Cash withdrawals — a real outflow, but not a category any budget plans for. */
export const CASH_WITHDRAWAL_RE = /\b(?:ATM|ATW|NWD|CASH\s*WDL|CASH\s*WITHDRAWAL)\b/;

/**
 * Resolve a description against the table.
 *
 * `validKeys` is the user's live category set. A rule proposing a key the user
 * does not have yields the merchant name with no category, so a deleted or
 * renamed category can never be silently reintroduced by the importer.
 */
export function matchRule(
  upperDescription: string,
  validKeys: ReadonlySet<string>,
): { merchant: string; category: string | null } | null {
  for (const rule of MERCHANT_RULES) {
    if (rule.match.test(upperDescription)) {
      const category = rule.category && validKeys.has(rule.category) ? rule.category : null;
      if (!rule.merchant && !category) continue;
      return { merchant: rule.merchant, category };
    }
  }
  return null;
}

