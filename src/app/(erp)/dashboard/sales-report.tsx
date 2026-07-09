import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MANUAL_SALES_PLATFORMS,
  SALES_REPORT_MODELS,
  getSalesReport,
  resolveSalesRange,
  type SalesRangeParams,
} from "@/lib/sales-report";
import { SalesReportExportButton } from "./sales-report-export";
import { SalesReportControls } from "./sales-report-controls";

type SalesReportProps = SalesRangeParams;

function formatCount(value: number): string {
  return value > 0 ? value.toLocaleString() : "";
}

export async function SalesReport(props: SalesReportProps) {
  const range = resolveSalesRange(props);
  const report = await getSalesReport(range);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Sales Report
        </CardTitle>
        <CardDescription>
          {report.rangeLabel} · {report.total.toLocaleString()} units
        </CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <SalesReportControls
            mode={report.mode}
            salesDate={report.salesDate}
            salesMonth={report.from.slice(0, 7)}
            salesFrom={report.from}
            salesTo={report.to}
            manualModels={Array.from(SALES_REPORT_MODELS)}
            manualPlatforms={Array.from(MANUAL_SALES_PLATFORMS)}
            manualQuantities={report.manualQuantities}
          />
          <SalesReportExportButton
            report={{
              salesDate: report.salesDate,
              rangeLabel: report.rangeLabel,
              total: report.total,
              models: report.models,
              rows: report.rows,
              modelTotals: report.modelTotals,
            }}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {report.models.length === 0 ? (
          <div className="px-4 pb-4">
            <div className="rounded-lg border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              No product models found yet.
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-40 bg-card">
                  Platform
                </TableHead>
                {report.models.map((model) => (
                  <TableHead key={model} className="min-w-28 text-center">
                    {model}
                  </TableHead>
                ))}
                <TableHead className="min-w-28 text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.platform}>
                  <TableCell className="sticky left-0 z-10 bg-card">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.platform}</span>
                      <Badge variant={row.entryMode === "auto" ? "default" : "outline"}>
                        {row.entryMode === "auto" ? "Auto" : "Manual"}
                      </Badge>
                    </div>
                  </TableCell>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.model} className="text-center">
                      {cell.total > 0 ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-mono font-semibold">
                            {cell.total.toLocaleString()}
                          </span>
                          {cell.auto > 0 && cell.manual > 0 && (
                            <span className="text-[10px] leading-none text-muted-foreground">
                              {cell.auto}+{cell.manual}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCount(row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-muted font-semibold">
                  Subtotal
                </TableCell>
                {report.modelTotals.map((cell) => (
                  <TableCell key={cell.model} className="text-center font-mono font-semibold">
                    {formatCount(cell.total)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-mono font-bold">
                  {formatCount(report.total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
