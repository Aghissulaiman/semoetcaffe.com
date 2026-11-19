"use client";

import { useTheme } from "@/context/ThemeContext";
import { orderStatusLabel } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import type { OrdersByStatus } from "@/types/api";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface OrderStatusDonutProps {
  data: OrdersByStatus[];
  height?: number;
  showLegend?: boolean;
}

/**
 * Donut sebaran status pesanan. Warna mengikuti palet kopi + status.
 */
export default function OrderStatusDonut({
  data,
  height = 280,
  showLegend = true,
}: OrderStatusDonutProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const labels = data.map((item) => orderStatusLabel(item.orderStatus));
  const series = data.map((item) => item.count);
  const total = series.reduce((sum, value) => sum + value, 0);

  const options: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "inherit",
      foreColor: isDark ? "#e8dccb" : "#8a7565",
    },
    labels,
    colors: ["#6f4e37", "#a9714b", "#c9a227", "#3f7d58", "#d98324", "#b4442e", "#8a7565"],
    stroke: { width: 0 },
    dataLabels: { enabled: false },
    legend: {
      show: showLegend,
      position: "bottom",
      fontSize: "12px",
      markers: { size: 6 },
      itemMargin: { horizontal: 8, vertical: 2 },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: { fontSize: "12px", offsetY: -4 },
            value: {
              fontSize: "22px",
              fontWeight: 700,
              offsetY: 4,
              formatter: (value: string) => formatNumber(Number(value)),
            },
            total: {
              show: true,
              label: "Total Pesanan",
              fontSize: "12px",
              formatter: () => formatNumber(total),
            },
          },
        },
      },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: { formatter: (value: number) => `${formatNumber(value)} pesanan` },
    },
  };

  return (
    <ReactApexChart options={options} series={series} type="donut" height={height} />
  );
}
