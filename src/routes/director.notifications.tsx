import { createFileRoute } from "@tanstack/react-router";
import { NotificationList } from "@/components/NotificationList";
import { useNotifications } from "@/hooks/use-notifications";

export const Route = createFileRoute("/director/notifications")({
  component: DirectorNotifications,
});

function DirectorNotifications() {
  const { notifications, markRead, markAllRead, unreadCount, fetchNotifications, currentPage, totalPages } = useNotifications();

  return (
    <NotificationList
      notifications={notifications}
      onMarkRead={markRead}
      onMarkAllRead={markAllRead}
      unreadCount={unreadCount}
      onRefresh={fetchNotifications}
      currentPage={currentPage}
      totalPages={totalPages}
    />
  );
}
