import { parseCsv } from "./csv";
import { readZipCsvFiles } from "./zip";
import type { ProductImportPackage } from "./types";

function baseName(name: string) {
  return name.split("/").pop() || name;
}

function keyOf(row: Record<string, string>) {
  return row.import_key || row.product_key || row.key || row.id || row.retailer_article_number || row.source_url || "";
}

function groupByKey(rows: Record<string, string>[]) {
  const map = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const existing = map.get(key) || [];
    existing.push(row);
    map.set(key, existing);
  }
  return map;
}

export async function parseProductImportFile(file: File): Promise<ProductImportPackage> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    const parsed = parseCsv(await file.text());
    return {
      packageKind: "single_csv",
      primaryFileName: file.name,
      parsedFiles: [file.name],
      cardRows: parsed.rows.map((raw) => ({ raw, support: {} })),
      warnings: [],
    };
  }

  if (!lower.endsWith(".zip")) {
    throw new Error("Upload a CSV file or a ZIP containing the LOOP import CSV package.");
  }

  const files = readZipCsvFiles(await file.arrayBuffer());
  if (!files.length) throw new Error("The ZIP did not contain any CSV files.");

  const parsed = files.map((f) => ({
    name: baseName(f.name),
    parsed: parseCsv(f.text),
  }));

  const primary = parsed.find((f) => /import_cards\.csv$/i.test(f.name))
    || parsed.find((f) => /cards\.csv$/i.test(f.name))
    || parsed[0];

  if (!primary.parsed.rows.length) throw new Error(`No product rows found in ${primary.name}.`);

  const sourceSnapshots = groupByKey(parsed.find((f) => /source_snapshots\.csv$/i.test(f.name))?.parsed.rows || []);
  const servingOptions = groupByKey(parsed.find((f) => /serving_options\.csv$/i.test(f.name))?.parsed.rows || []);
  const sourceAllergens = groupByKey(parsed.find((f) => /source_allergens\.csv$/i.test(f.name))?.parsed.rows || []);
  const qualitySummary = groupByKey(parsed.find((f) => /quality_summary\.csv$/i.test(f.name))?.parsed.rows || []);
  const inferredAllergens = groupByKey(parsed.find((f) => /inferred_allergens_review\.csv$/i.test(f.name))?.parsed.rows || []);
  const categoryQueue = groupByKey(parsed.find((f) => /category_queue\.csv$/i.test(f.name))?.parsed.rows || []);
  const fieldMapping = groupByKey(parsed.find((f) => /field_mapping\.csv$/i.test(f.name))?.parsed.rows || []);

  const warnings: string[] = [];
  if (!parsed.some((f) => /source_snapshots\.csv$/i.test(f.name))) warnings.push("No source_snapshots CSV found.");
  if (!parsed.some((f) => /serving_options\.csv$/i.test(f.name))) warnings.push("No serving_options CSV found.");
  if (!parsed.some((f) => /source_allergens\.csv$/i.test(f.name))) warnings.push("No source_allergens CSV found.");

  return {
    packageKind: "multi_csv_zip",
    primaryFileName: primary.name,
    parsedFiles: parsed.map((f) => f.name),
    warnings,
    cardRows: primary.parsed.rows.map((raw) => {
      const key = keyOf(raw);
      return {
        raw,
        support: {
          source_snapshot: key ? sourceSnapshots.get(key)?.[0] : undefined,
          serving_options: key ? servingOptions.get(key) || [] : [],
          source_allergens: key ? sourceAllergens.get(key) || [] : [],
          quality_summary: key ? qualitySummary.get(key) || [] : [],
          inferred_allergens_review: key ? inferredAllergens.get(key) || [] : [],
          category_queue: key ? categoryQueue.get(key) || [] : [],
          field_mapping: key ? fieldMapping.get(key) || [] : [],
        },
      };
    }),
  };
}
