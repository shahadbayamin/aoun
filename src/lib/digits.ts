/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → 0-9, so numbers typed on an Arabic phone keyboard work everywhere. */
export const latinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** Keep only the digits (any script). */
export const onlyDigits = (s: string) => latinDigits(s).replace(/\D/g, "");
