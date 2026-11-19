"use client";

import { useTheme } from "@/context/ThemeContext";
import { formatCompact, formatIdr } from "@/lib/format";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface TopProductsBarChartProps {
  categories: string[];
  series: number[];
  height?: number;
  seriesName?: string;
}

/**
 * Grafik batang horizontal untuk produk terlaris.
 */
export default function TopProductsBarChart({
  categories,
  series,
  height = 320,
  seriesName = "Omzet",
}: TopProductsBarChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const options: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: isDark ? "#e8dccb" : "#8a7565",
    },
    colors: ["#a9714b"],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
        borderRadiusApplication: "end",
        barHeight: "55%",
      },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: isDark ? "#3e2c1e" : "#f1e4d5",
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        formatter: (value: string) => formatCompact(Number(value)),
        style: { fontSize: "12px" },
      },
    },
    yaxis: { labels: { style: { fontSize: "12px" } } },
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
      type="bar"
      height={height}
    />
  );
}
