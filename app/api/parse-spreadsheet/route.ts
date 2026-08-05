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

// Never throws -- an unexpected cell shape (formula error, malformed rich
// text, whatever a real-world workbook throws at us) degrades to an empty
// string instead of taking down the whole request. A first version of
// this let a bad cell anywhere in the workbook produce an uncaught 500
// with no error body.
function cellToText(value: unknown): string {
  try {
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object") {
      if ("error" in value) return ""; // formula error cell (#DIV/0!, #N/A, ...)
      if ("richText" in value && Array.isArray((value as RichTextCell).richText)) {
        return (value as RichTextCell).richText.map((r) => String(r?.text ?? "")).join("");
      }
      if ("result" in value) return cellToText((value as FormulaCell).result);
      if ("text" in value) return cellToText((value as HyperlinkCell).text);
      return "";
    }
    return String(value);
  } catch {
    return "";
  }
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

  // Each sheet is parsed in isolation: one malformed sheet (unsupported
  // feature, corrupt row) shouldn't sink every other sheet in the same
  // workbook. Logged server-side since this sandbox can't reach
  // production to reproduce a failure directly from a bug report.
  const sheetErrors: string[] = [];
  let sheets: { name: string; text: string }[];
  try {
    sheets = workbook.worksheets
      .map((ws) => {
        try {
          const lines: string[] = [];
          ws.eachRow((row) => {
            const cells: string[] = [];
            // A merged cell's value shows up on every cell in the merge
            // range via row.values -- only take it at the anchor
            // (cell.master === cell), otherwise a banner row repeats
            // itself once per spanned column.
            row.eachCell({ includeEmpty: true }, (cell) => {
              cells.push(cell.isMerged && cell.master !== cell ? "" : cellToText(cell.value).trim());
            });
            if (cells.some((c) => c !== "")) {
              lines.push(cells.join(" | "));
            }
          });
          return { name: ws.name, text: lines.join("\n") };
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown error";
          console.error(`[parse-spreadsheet] sheet "${ws.name}" failed to parse:`, error);
          sheetErrors.push(`${ws.name}: ${message}`);
          return { name: ws.name, text: "" };
        }
      })
      .filter((s) => s.text.trim() !== "");
  } catch (error) {
    console.error("[parse-spreadsheet] workbook-level failure:", error);
    return NextResponse.json(
      {
        error: `Couldn't read that workbook's sheets: ${error instanceof Error ? error.message : "unknown error"}`,
      },
      { status: 400 }
    );
  }

  if (sheets.length === 0) {
    return NextResponse.json(
      {
        error:
          sheetErrors.length > 0
            ? `Couldn't extract readable content -- every sheet failed to parse (${sheetErrors.join("; ")})`
            : "That spreadsheet has no readable content",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ sheets, sheetErrors: sheetErrors.length > 0 ? sheetErrors : undefined });
}
