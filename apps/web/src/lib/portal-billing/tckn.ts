// Turkish identity number (TCKN) check digits, the same rule as the database
// (private.is_valid_tckn): 11 digits, not starting with 0; digit 10 is
// (7 × odd sum − even sum) mod 10 over digits 1–9, digit 11 the sum of
// digits 1–10 mod 10. A valid checksum does not prove that the number exists.
export function isValidTckn(value: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return tenth === d[9] && sum % 10 === d[10];
}
