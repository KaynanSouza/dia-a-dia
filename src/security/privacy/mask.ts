/** F-03: números sensíveis exibem só os 4 últimos dígitos. */
export const maskDigits = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits ? `•••• ${digits.slice(-4)}` : '';
};
