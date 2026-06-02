/**
 * engine/math/growth.ts
 *
 * Growth formulas for salary, rent, and property value.
 *
 * Key conventions:
 * - **Salary**: steps annually. salaryAnnual(y) = base * (1+g)^y.
 *   Monthly net = salaryAnnual(floor(m/12)) * (1 - taxRate) / 12.
 *   UI must label the input as "gross salary" to avoid double-deduction.
 *
 * - **Rent**: annual step (lease-style). rent(m) = monthlyRent * (1+r)^floor(m/12).
 *   Do NOT compound monthly — leases renew yearly, not every month.
 *
 * - **Property value**: monthly step to avoid staircase artifacts.
 *   v(m) = initialValue * (1+a)^(m/12), equivalently:
 *   v_{m+1} = v_m * (1+a)^(1/12).
 */

/**
 * Annual gross salary at year y (0-based).
 *
 * @param baseAnnual  Current annual gross salary (nominal)
 * @param growthRate  Annual salary growth rate as a decimal
 * @param year        Year index (0 = current year)
 * @returns Gross annual salary for that year
 */
export function annualSalary(
  baseAnnual: number,
  growthRate: number,
  year: number,
): number {
  return baseAnnual * Math.pow(1 + growthRate, year)
}

/**
 * Monthly net salary for a given month.
 *
 * Steps annually (salary increases take effect at the start of each year).
 *
 * @param baseAnnual  Current annual gross salary (nominal)
 * @param growthRate  Annual salary growth rate as a decimal
 * @param taxRate     Flat income tax rate as a decimal
 * @param month       Month index (0-based)
 * @returns Monthly net salary (after flat income tax)
 */
export function monthlyNetSalary(
  baseAnnual: number,
  growthRate: number,
  taxRate: number,
  month: number,
): number {
  const year = Math.floor(month / 12)
  const gross = annualSalary(baseAnnual, growthRate, year)
  return (gross * (1 - taxRate)) / 12
}

/**
 * Monthly rent at month m (lease-style annual step).
 *
 * Rent steps once per year (at month 12, 24, 36, …), not every month.
 * This models a standard lease renewal schedule.
 *
 * @param baseMonthlyRent  Initial monthly rent (nominal)
 * @param annualGrowthRate Annual rent growth rate as a decimal
 * @param month            Month index (0-based)
 * @returns Monthly rent at month m
 */
export function monthlyRent(
  baseMonthlyRent: number,
  annualGrowthRate: number,
  month: number,
): number {
  const year = Math.floor(month / 12)
  return baseMonthlyRent * Math.pow(1 + annualGrowthRate, year)
}

/**
 * Property value at month m (monthly-stepped to avoid staircase artifacts).
 *
 * v(m) = initialValue * (1 + annualRate)^(m/12)
 *
 * @param initialValue     Property value at month 0
 * @param annualRate       Annual appreciation rate as a decimal
 * @param month            Month index (0-based)
 * @returns Property value at month m
 */
export function propertyValueAtMonth(
  initialValue: number,
  annualRate: number,
  month: number,
): number {
  return initialValue * Math.pow(1 + annualRate, month / 12)
}

/**
 * Monthly property tax and maintenance cost combined.
 *
 * Both rates are annual fractions of current property value.
 * Monthly cost = propertyValue_m * (taxRate + maintenanceRate) / 12.
 *
 * @param propertyValue     Current property value (at this month)
 * @param annualTaxRate     Annual property tax rate as a decimal
 * @param annualMaintRate   Annual maintenance rate as a decimal
 * @returns Total monthly property holding cost
 */
export function monthlyPropertyCost(
  propertyValue: number,
  annualTaxRate: number,
  annualMaintRate: number,
): number {
  return (propertyValue * (annualTaxRate + annualMaintRate)) / 12
}
