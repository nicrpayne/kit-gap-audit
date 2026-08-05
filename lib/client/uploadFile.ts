export interface ParsedSheet {
  name: string;
  text: string;
}

export interface ReadUploadedFileResult {
  text: string;
  // Present (and >1) when the file had multiple sheets -- callers should
  // offer a picker; `text` above is already the first sheet's content.
  sheets?: ParsedSheet[];
}

const SPREADSHEET_EXTENSIONS = [".xlsx"];
const TEXT_EXTENSIONS = [".txt", ".md", ".csv"];

// .txt/.md/.csv are already plain text -- read directly. .xlsx needs real
// parsing, done server-side (lib/exceljs isn't meant for the browser
// bundle) via POST /api/parse-spreadsheet.
export async function readUploadedFile(file: File): Promise<ReadUploadedFileResult> {
  const name = file.name.toLowerCase();

  if (SPREADSHEET_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/parse-spreadsheet", { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Couldn't read that spreadsheet.");
    }
    const { sheets } = (await res.json()) as { sheets: ParsedSheet[] };
    return { text: sheets[0]?.text ?? "", sheets };
  }

  if (TEXT_EXTENSIONS.some((ext) => name.endsWith(ext)) || file.type.startsWith("text/")) {
    return { text: await file.text() };
  }

  throw new Error("Unsupported file type — use .txt, .md, .csv, or .xlsx.");
}
