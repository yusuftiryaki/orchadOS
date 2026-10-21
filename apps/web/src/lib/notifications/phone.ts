// Phone numbers on screen are masked: operations and the login page show
// enough to tell numbers apart, not enough to dial. +905321234501 ->
// "+90 5•• ••• •• 01" (Turkish mobile layout); other countries keep the
// country code's first digits and the last two digits.
const DOT = "•";

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 7) return DOT.repeat(4);
  const last = digits.slice(-2);
  const tr = /^90(5\d{9})$/.exec(digits);
  if (tr) return `+90 5${DOT.repeat(2)} ${DOT.repeat(3)} ${DOT.repeat(2)} ${last}`;
  const hidden = DOT.repeat(Math.max(digits.length - 4, 1));
  return `+${digits.slice(0, 2)} ${hidden} ${last}`;
}
