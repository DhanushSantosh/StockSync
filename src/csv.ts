type CsvValue = string | number;

export function downloadCsv(filename: string, rows: CsvValue[][]) {
  const cell = (value: CsvValue) => {
    const text = String(value);
    // Spreadsheet apps can execute formulas even when a CSV cell is quoted.
    const safe =
      typeof value === "string" && /^[\s]*[=+@-]/.test(text)
        ? `'${text}`
        : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(
    [rows.map((row) => row.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
