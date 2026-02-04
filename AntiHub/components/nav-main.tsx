"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconCirclePlusFilled, type Icon } from "@tabler/icons-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { AddAccountDrawer } from "@/components/add-account-drawer"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: Icon
  }[]
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              <SidebarMenuButton
                tooltip="添加账号"
                onClick={() => setIsDrawerOpen(true)}
                className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary active:bg-primary/20 active:text-primary border border-primary/20 min-w-8 duration-200 ease-linear cursor-pointer font-medium"
              >
                <IconCirclePlusFilled />
                <span>添加账号</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarMenu>
            {items.map((item) => {
              // 精确匹配逻辑：避免 /dashboard 匹配所有子路径
              const isActive = pathname === item.url ||
                (item.url !== '/dashboard' && pathname.startsWith(item.url + '/'))
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    asChild
                    isActive={isActive}
                    className={isActive ? "bg-primary/30 dark:bg-primary/15 text-primary font-semibold" : ""}
                  >
                    <Link href={item.url}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <AddAccountDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </>
  )
}
