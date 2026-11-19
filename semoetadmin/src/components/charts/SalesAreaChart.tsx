"use client";

import { useTheme } from "@/context/ThemeContext";
import { formatCompact, formatIdr } from "@/lib/format";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface SalesAreaChartProps {
  categories: string[];
  series: number[];
  height?: number;
  seriesName?: string;
}

/**
 * Grafik area omzet. Warna mengikuti palet kopi Semoet.
 */
export default function SalesAreaChart({
  categories,
  series,
  height = 300,
  seriesName = "Omzet",
}: SalesAreaChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const options: ApexOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: isDark ? "#e8dccb" : "#8a7565",
      animations: { enabled: true, speed: 400 },
    },
    colors: ["#6f4e37"],
    stroke: { curve: "smooth", width: 2.5 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.02,
        stops: [0, 95, 100],
      },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: isDark ? "#3e2c1e" : "#f1e4d5",
      strokeDashArray: 4,
      padding: { left: 8, right: 8 },
    },
    markers: { size: 0, hover: { size: 5 } },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "12px" } },
    },
    yaxis: {
      labels: {
        formatter: (value: number) => formatCompact(value),
        style: { fontSize: "12px" },
      },
    },
    legend: { show: false },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: { formatter: (value: number) => formatIdr(value) },
    },
  };

  return (
    <ReactApexChart
      options={options}
      series={[{ name: seriesName, data: series }]}
      type="area"
      height={height}
    />
  );
}
