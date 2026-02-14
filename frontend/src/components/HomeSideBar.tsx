import { useMemo, useState } from "react";

import { TOP_BAR_HEIGHT } from "./style";
import "./HomeSideBar.css";
import { LuHouse, LuMenu, LuSettings, LuUtensils } from "react-icons/lu";
import type { IconType } from "react-icons";

interface Props {
  username?: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

export const EXPANDED_SIDEBAR_WIDTH = 150;
export const COLLAPSED_SIDEBAR_WIDTH = 40;

export default function HomeSideBar({ username, isCollapsed, onToggle }: Props) {
  type MenuItem = {
    id: string;
    title: string;
    icon: IconType;
  };

  const menuItems: MenuItem[] = useMemo(
    () => [
      { id: "home", title: "Home", icon: LuHouse },
      { id: "settings", title: "Settings", icon: LuSettings },
      { id: "homnayangi", title: "Homnayangi", icon: LuUtensils },
    ],
    []
  );
  const [activeItem, setActiveItem] = useState<string | null>("Home");

  return (
    <aside
      className="home-sidebar"
      style={{
        top: TOP_BAR_HEIGHT,
        height: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
        width: isCollapsed ? COLLAPSED_SIDEBAR_WIDTH : EXPANDED_SIDEBAR_WIDTH,
      }}
      aria-label={username ? `${username} sidebar` : "App sidebar"}
    >
      <nav className="home-sidebar-nav">
        <ul className="home-sidebar-list">
          <li>
            <button
              type="button"
              onClick={onToggle}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`home-sidebar-row ${isCollapsed ? "collapsed" : ""}`}
            >
              <LuMenu />
            </button>
          </li>

          {menuItems.map((item) => {
            const isActive = activeItem === item.id;
            const Icon = item.icon;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`home-sidebar-row ${isActive ? "active" : ""} ${isCollapsed ? "collapsed" : ""
                    }`}
                  onClick={() =>
                    setActiveItem((current) => (current === item.id ? null : item.id))
                  }
                  title={item.title}
                  aria-pressed={isActive}
                >
                  <Icon className="home-sidebar-icon" aria-hidden />
                  {!isCollapsed && (
                    <span className="home-sidebar-label">{item.title}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
