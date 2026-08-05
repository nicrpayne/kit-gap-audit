import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface RichTextCell {
  richText: { text: string }[];
}
interface HyperlinkCell {
  text: unknown;
}
interface FormulaCell {
  result: unknown;
}

function cellToText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return (value as RichTextCell).richText.map((r) => r.text).join("");
    if ("result" in value) return cellToText((value as FormulaCell).result);
    if ("text" in value) return cellToText((value as HyperlinkCell).text);
    return "";
  }
  return String(value);
}

// Parses an uploaded .xlsx into plain text per sheet, formatted as
// pipe-delimited rows -- the same shape Nic's been manually copy/pasting
// out of Excel into "Other context" and the Audit form. Blank rows are
// dropped (reduces noise and token count alike). .csv/.txt/.md don't need
// this -- they're already plain text, read client-side.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10MB)" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Couldn't read that as an .xlsx file: ${error instanceof Error ? error.message : "unknown error"}. Legacy .xls isn't supported -- re-save as .xlsx first.`,
      },
      { status: 400 }
    );
  }

  const sheets = workbook.worksheets
    .map((ws) => {
      const lines: string[] = [];
      ws.eachRow((row) => {
        const cells: string[] = [];
        // A merged cell's value shows up on every cell in the merge range
        // via row.values -- only take it at the anchor (cell.master ===
        // cell), otherwise a banner row repeats itself once per column.
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(cell.isMerged && cell.master !== cell ? "" : cellToText(cell.value).trim());
        });
        if (cells.some((c) => c !== "")) {
          lines.push(cells.join(" | "));
        }
      });
      return { name: ws.name, text: lines.join("\n") };
    })
    .filter((s) => s.text.trim() !== "");

  if (sheets.length === 0) {
    return NextResponse.json({ error: "That spreadsheet has no readable content" }, { status: 400 });
  }

  return NextResponse.json({ sheets });
}
