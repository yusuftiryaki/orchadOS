// State of an operations form between a server action and the page: a form
// error, Turkish text per field, and the typed values (so that the form keeps
// them after a failed save). Values stay between the server and the ops
// user's browser; they are never logged.
export interface FormState {
  error: string | null;
  fieldErrors: Record<string, string>;
  values: Record<string, string>;
  // Set once on success by forms that stay on the page (new owner).
  done?: {
    profileId: string;
    accountCreated: boolean;
    oneTimePassword: string | null;
    loginEmail: string | null;
  };
}

export const EMPTY_FORM: FormState = { error: null, fieldErrors: {}, values: {} };

export function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}
