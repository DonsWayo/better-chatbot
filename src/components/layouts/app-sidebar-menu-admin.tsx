import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "ui/sidebar";
import { Tooltip } from "ui/tooltip";
import { SidebarMenuItem } from "ui/sidebar";
import { SidebarMenuButton } from "ui/sidebar";
import { BarChart3, Plug2, Shield, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const AppSidebarAdmin = () => {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Admin");
  const shouldExpandAdmin = useMemo(() => {
    return pathname.startsWith("/admin");
  }, [pathname]);
  const adminNavItems = useMemo(
    () => [
      {
        id: "users",
        title: t("Users.title"),
        url: "/admin",
        icon: Users,
        isActive: pathname.startsWith("/admin/users"),
      },
      {
        id: "teams",
        title: t("Teams.title"),
        url: "/admin/teams",
        icon: UsersRound,
        isActive: pathname.startsWith("/admin/teams"),
      },
      {
        id: "usage",
        title: t("Usage.title"),
        url: "/admin/usage",
        icon: BarChart3,
        isActive: pathname.startsWith("/admin/usage"),
      },
      {
        id: "mcp",
        title: t("MCP.adminTitle"),
        url: "/admin/mcp",
        icon: Plug2,
        isActive: pathname.startsWith("/admin/mcp"),
      },
    ],
    [t, pathname],
  );

  return (
    <SidebarMenu className="group/admin">
      <Tooltip>
        <SidebarMenuItem>
          <Link href="/admin" data-testid="admin-sidebar-link">
            <SidebarMenuButton className="font-semibold">
              <Shield className="size-4 text-foreground" />
              {t("title")}
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      </Tooltip>
      {shouldExpandAdmin && (
        <SidebarMenuSub className="mb-2">
          {adminNavItems.map((item) => (
            <SidebarMenuSubItem key={item.id}>
              <SidebarMenuSubButton
                className="text-muted-foreground"
                data-testid={`admin-sidebar-link-${item.id}`}
                onClick={() => {
                  router.push(item.url);
                }}
                isActive={item.isActive}
              >
                {item.title}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenu>
  );
};

export { AppSidebarAdmin };
