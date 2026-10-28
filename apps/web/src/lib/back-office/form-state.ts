// What a back office server action returns when it does not redirect: the
// Turkish error text (the reason code's text, with the field when one is
// named) and, for the TCKN reveal only, the value to show once.
export interface BoFormState {
  error: string | null;
  revealed?: string | null;
  // A form acting on several records (Tüm bahçeleri çıkar): one result line
  // per record, the error text or what was done.
  lines?: { label: string; ok: boolean; text: string }[];
}

export const EMPTY_BO_FORM: BoFormState = { error: null };
