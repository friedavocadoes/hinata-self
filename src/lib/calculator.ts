export type GlobalSettingsMap = Record<string, number>;

export function calculateLineItem(
  item: { qty: number; cifUsd: number; defaultProfitPct: number }, 
  settings: GlobalSettingsMap,
  creditDays: number
) {
  // 1. Ex-Works Cost (Purchase Cost)
  const exchangeRate = settings['usd_to_aed_conversion'] || 3.6725;
  const exWorksCost = item.qty * item.cifUsd * exchangeRate;

  // 2. Finance Charges (Simplified for this step)
  const annualInterest = settings['annual_interest_rate'] || 0.10;
  const capitalInterest = exWorksCost * annualInterest * (creditDays / 365);
  const bankFee = settings['tt_bank_flat_fee'] || 30; 

  // 3. Total Cost
  const totalCost = exWorksCost + capitalInterest + bankFee;

  // 4. Margin & Selling Price
  const profitMargin = item.defaultProfitPct / 100; // e.g., 5% -> 0.05
  const salesPrice = totalCost / (1 - profitMargin);
  const profitAmount = salesPrice - totalCost;

  return {
    exWorksCost,
    totalCost,
    salesPrice,
    profitAmount
  };
}