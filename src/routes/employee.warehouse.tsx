import { createFileRoute } from "@tanstack/react-router";
import { WarehousePage } from "@/components/WarehousePage";

export const Route = createFileRoute("/employee/warehouse")({
  component: WarehousePage,
});
