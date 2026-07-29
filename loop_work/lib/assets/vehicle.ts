export function poundsToPence(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.\-]/g, "")) : Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function estimateVehicleRunningCosts(input: {
  annualMileage?: number | null;
  averageMpg?: number | null;
  electricityKwhPerMile?: number | null;
  fuelPricePencePerLitre?: number | null;
  electricityPricePencePerKwh?: number | null;
  monthlyFinancePence?: number | null;
  insuranceAnnualPence?: number | null;
  taxAnnualPence?: number | null;
  motAnnualPence?: number | null;
  maintenanceAnnualPence?: number | null;
}) {
  const annualMileage = Number(input.annualMileage || 0);
  let fuelOrEnergyAnnualPence = 0;

  if (annualMileage > 0 && Number(input.electricityKwhPerMile || 0) > 0) {
    fuelOrEnergyAnnualPence = Math.round(
      annualMileage * Number(input.electricityKwhPerMile) * Number(input.electricityPricePencePerKwh || 28)
    );
  } else if (annualMileage > 0 && Number(input.averageMpg || 0) > 0) {
    fuelOrEnergyAnnualPence = Math.round(
      annualMileage * (4.54609 / Number(input.averageMpg)) * Number(input.fuelPricePencePerLitre || 145)
    );
  }

  const annual =
    fuelOrEnergyAnnualPence +
    Number(input.insuranceAnnualPence || 0) +
    Number(input.taxAnnualPence || 0) +
    Number(input.motAnnualPence || 0) +
    Number(input.maintenanceAnnualPence || 0) +
    Number(input.monthlyFinancePence || 0) * 12;

  return {
    fuelOrEnergyAnnualPence,
    runningCostAnnualPence: annual,
    runningCostPerMilePence: annualMileage > 0 ? Math.round((annual / annualMileage) * 100) / 100 : 0,
  };
}
