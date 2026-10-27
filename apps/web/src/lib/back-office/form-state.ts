// What a back office server action returns when it does not redirect: the
// Turkish error text (the reason code's text, with the field when one is
// named) and, for the TCKN reveal only, the value to show once.
export interface BoFormState {
  error: string | null;
  revealed?: string | null;
}

export const EMPTY_BO_FORM: BoFormState = { error: null };
