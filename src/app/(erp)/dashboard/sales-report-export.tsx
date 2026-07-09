"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SalesReportExportCell {
  model: string;
  auto: number;
  manual: number;
  total: number;
}

interface SalesReportExportRow {
  platform: string;
  entryMode: "auto" | "manual";
  cells: SalesReportExportCell[];
  total: number;
}

export interface SalesReportExportData {
  salesDate: string;
  rangeLabel: string;
  total: number;
  models: string[];
  rows: SalesReportExportRow[];
  modelTotals: SalesReportExportCell[];
}

interface SalesReportExportButtonProps {
  report: SalesReportExportData;
}

function formatCount(value: number): string {
  return value > 0 ? value.toLocaleString() : "-";
}

function compactReport(report: SalesReportExportData): SalesReportExportData {
  const modelIndexes = report.modelTotals
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.total > 0)
    .map(({ index }) => index);
  const rows = report.rows
    .filter((row) => row.total > 0)
    .map((row) => ({
      ...row,
      cells: modelIndexes.map((index) => row.cells[index]),
    }));

  return {
    ...report,
    models: modelIndexes.map((index) => report.models[index]),
    rows,
    modelTotals: modelIndexes.map((index) => report.modelTotals[index]),
  };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] {
  const words = text.includes(" ") ? text.split(/\s+/) : text.split(/(?=[-/])/);
  const lines: string[] = [];
  let current = "";

  function pushLongWord(word: string) {
    let part = "";
    for (const char of word) {
      const next = `${part}${char}`;
      if (part && ctx.measureText(next).width > maxWidth) {
        lines.push(part);
        part = char;
      } else {
        part = next;
      }
      if (lines.length >= maxLines) return "";
    }
    return part;
  }

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = ctx.measureText(word).width > maxWidth ? pushLongWord(word) : word;
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0) lines.push(text);

  if (lines.length === maxLines && ctx.measureText(lines[maxLines - 1]).width > maxWidth) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}...`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}...`;
  }

  return lines;
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke = "#d7dce2"
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { font: string; color?: string; maxLines?: number }
) {
  ctx.font = options.font;
  ctx.fillStyle = options.color ?? "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, text, width - 12, options.maxLines ?? 2);
  const lineHeight = 14;
  const startY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, x + width / 2, startY + index * lineHeight);
  });
}

function drawLeftText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { font: string; color?: string }
) {
  ctx.font = options.font;
  ctx.fillStyle = options.color ?? "#111827";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  let value = text;
  while (value.length > 1 && ctx.measureText(value).width > width - 18) {
    value = value.slice(0, -1);
  }
  if (value !== text) value = `${value.slice(0, -3)}...`;
  ctx.fillText(value, x + 10, y + height / 2);
}

function drawSalesReportCanvas(report: SalesReportExportData): HTMLCanvasElement {
  const platformWidth = 210;
  const modelWidth = 152;
  const subtotalWidth = 124;
  const padding = 24;
  const titleHeight = 58;
  const headerHeight = 72;
  const rowHeight = 42;
  const footerHeight = 44;

  const tableWidth = platformWidth + report.models.length * modelWidth + subtotalWidth;
  const tableHeight = headerHeight + report.rows.length * rowHeight + footerHeight;
  const width = padding * 2 + tableWidth;
  const height = padding * 2 + titleHeight + tableHeight;
  const scale = Math.max(2, Math.min(window.devicePixelRatio || 3, 3));

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create PNG canvas");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#111827";
  ctx.font = "700 22px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Sales Report", padding, padding);

  ctx.fillStyle = "#6b7280";
  ctx.font = "13px Arial, sans-serif";
  ctx.fillText(`${report.rangeLabel} · ${report.total.toLocaleString()} units · non-zero rows and columns`, padding, padding + 31);

  let x = padding;
  let y = padding + titleHeight;

  drawRect(ctx, x, y, platformWidth, headerHeight, "#f3f4f6");
  drawLeftText(ctx, "Platform", x, y, platformWidth, headerHeight, {
    font: "700 13px Arial, sans-serif",
  });
  x += platformWidth;

  for (const model of report.models) {
    drawRect(ctx, x, y, modelWidth, headerHeight, "#f3f4f6");
    drawCenteredText(ctx, model, x, y, modelWidth, headerHeight, {
      font: "700 12px Arial, sans-serif",
      maxLines: 3,
    });
    x += modelWidth;
  }

  drawRect(ctx, x, y, subtotalWidth, headerHeight, "#f3f4f6");
  drawCenteredText(ctx, "Subtotal", x, y, subtotalWidth, headerHeight, {
    font: "700 13px Arial, sans-serif",
  });

  y += headerHeight;
  for (const [rowIndex, row] of report.rows.entries()) {
    x = padding;
    const fill = rowIndex % 2 === 0 ? "#ffffff" : "#fbfdff";

    drawRect(ctx, x, y, platformWidth, rowHeight, fill);
    drawLeftText(ctx, row.platform, x, y - 4, platformWidth, rowHeight, {
      font: "600 13px Arial, sans-serif",
    });
    drawLeftText(ctx, row.entryMode === "auto" ? "Auto" : "Manual", x, y + 10, platformWidth, rowHeight, {
      font: "10px Arial, sans-serif",
      color: "#6b7280",
    });
    x += platformWidth;

    for (const cell of row.cells) {
      drawRect(ctx, x, y, modelWidth, rowHeight, fill);
      drawCenteredText(ctx, formatCount(cell.total), x, y, modelWidth, rowHeight, {
        font: cell.total > 0 ? "700 13px Menlo, Consolas, monospace" : "12px Arial, sans-serif",
        color: cell.total > 0 ? "#111827" : "#9ca3af",
        maxLines: 1,
      });
      if (cell.auto > 0 && cell.manual > 0) {
        ctx.font = "10px Arial, sans-serif";
        ctx.fillStyle = "#6b7280";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${cell.auto}+${cell.manual}`, x + modelWidth / 2, y + rowHeight - 8);
      }
      x += modelWidth;
    }

    drawRect(ctx, x, y, subtotalWidth, rowHeight, fill);
    drawCenteredText(ctx, formatCount(row.total), x, y, subtotalWidth, rowHeight, {
      font: row.total > 0 ? "700 13px Menlo, Consolas, monospace" : "12px Arial, sans-serif",
      color: row.total > 0 ? "#111827" : "#9ca3af",
      maxLines: 1,
    });
    y += rowHeight;
  }

  x = padding;
  drawRect(ctx, x, y, platformWidth, footerHeight, "#eef2f7");
  drawLeftText(ctx, "Subtotal", x, y, platformWidth, footerHeight, {
    font: "700 13px Arial, sans-serif",
  });
  x += platformWidth;

  for (const cell of report.modelTotals) {
    drawRect(ctx, x, y, modelWidth, footerHeight, "#eef2f7");
    drawCenteredText(ctx, formatCount(cell.total), x, y, modelWidth, footerHeight, {
      font: cell.total > 0 ? "700 13px Menlo, Consolas, monospace" : "12px Arial, sans-serif",
      color: cell.total > 0 ? "#111827" : "#9ca3af",
      maxLines: 1,
    });
    x += modelWidth;
  }

  drawRect(ctx, x, y, subtotalWidth, footerHeight, "#e5eaf1");
  drawCenteredText(ctx, formatCount(report.total), x, y, subtotalWidth, footerHeight, {
    font: "700 14px Menlo, Consolas, monospace",
    maxLines: 1,
  });

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to export PNG"));
    }, "image/png");
  });
}

export function SalesReportExportButton({ report }: SalesReportExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const exportPng = async () => {
    setExporting(true);
    try {
      const canvas = drawSalesReportCanvas(compactReport(report));
      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const slug = report.rangeLabel.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "") || report.salesDate;
      const link = document.createElement("a");
      link.href = url;
      link.download = `sales-report-${slug}-compact.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Unable to export PNG");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" onClick={exportPng} disabled={exporting || report.models.length === 0}>
      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Export PNG
    </Button>
  );
}
