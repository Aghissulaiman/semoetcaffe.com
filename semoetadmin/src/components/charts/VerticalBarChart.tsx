"use client";

import { useTheme } from "@/context/ThemeContext";
import { formatCompact, formatIdr, formatNumber } from "@/lib/format";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface VerticalBarChartProps {
  categories: string[];
  series: number[];
  height?: number;
  seriesName?: string;
  color?: string;
  /** Format tooltip: "idr" (Rupiah) atau "number". */
  valueFormat?: "idr" | "number";
}

/**
 * Grafik batang vertikal generik untuk sebaran (mis. per jam / per hari).
 */
export default function VerticalBarChart({
  categories,
  series,
  height = 280,
  seriesName = "Nilai",
  color = "#6f4e37",
  valueFormat = "idr",
}: VerticalBarChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const formatValue = (value: number) =>
    valueFormat === "idr" ? formatIdr(value) : `${formatNumber(value)} pesanan`;

  const options: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: isDark ? "#e8dccb" : "#8a7565",
    },
    colors: [color],
    plotOptions: {
      bar: {
        borderRadius: 5,
        borderRadiusApplication: "end",
        columnWidth: "55%",
      },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: isDark ? "#3e2c1e" : "#f1e4d5",
      strokeDashArray: 4,
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: {
      labels: {
        formatter: (value: number) =>
          valueFormat === "idr" ? formatCompact(value) : formatCompact(value),
        style: { fontSize: "12px" },
      },
    },
    legend: { show: false },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: { formatter: formatValue },
    },
  };

  return (
    <ReactApexChart
      options={options}
      series={[{ name: seriesName, data: series }]}
      type="bar"
      height={height}
    />
  );
}
