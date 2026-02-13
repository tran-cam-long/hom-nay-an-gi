import { useMemo, useState } from "react";

import { TOP_BAR_HEIGHT } from "./style";
import "./HomeSideBar.css";

interface Props {
  username?: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

export const EXPANDED_SIDEBAR_WIDTH = 240;
export const COLLAPSED_SIDEBAR_WIDTH = 40;

function LayoutIcon() {
  return (
    <span className="layout-icon" aria-hidden>
      <span className="layout-icon-sidebar" />
      <span className="layout-icon-main" />
    </span>
  );
}

export default function HomeSideBar({ username, isCollapsed, onToggle }: Props) {
  const menuItems = useMemo(() => ["Home", "Settings", "Homnayangi"], []);
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
              <LayoutIcon />
            </button>
          </li>

          {menuItems.map((item) => {
            const isActive = activeItem === item;

            return (
              <li key={item}>
                <button
                  type="button"
                  className={`home-sidebar-row ${isActive ? "active" : ""} ${
                    isCollapsed ? "collapsed" : ""
                  }`}
                  onClick={() =>
                    setActiveItem((current) => (current === item ? null : item))
                  }
                  title={item}
                  aria-pressed={isActive}
                >
                  <span className="home-sidebar-icon" aria-hidden />
                  {!isCollapsed && (
                    <span className="home-sidebar-label">{item}</span>
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
