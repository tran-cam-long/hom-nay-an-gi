import { useMemo } from "react";
import { LuHouse, LuSettings, LuUtensils } from "react-icons/lu";
import type { IconType } from "react-icons";
import "./HomeBottomBar.css";
import type { PageKey } from "../types/navigation";

interface Props {
  username?: string;
  activeItem: PageKey;
  onItemSelect: (page: PageKey) => void;
}

export const HOME_BOTTOM_BAR_HEIGHT = 50;

type MenuItem = {
  id: PageKey;
  title: string;
  icon: IconType;
};

export default function HomeBottomBar({ username, activeItem, onItemSelect }: Props) {
  const menuItems: MenuItem[] = useMemo(
    () => [
      { id: "settings", title: "Settings", icon: LuSettings },
      { id: "home", title: "Home", icon: LuHouse },
      { id: "homnayangi", title: "Homnayangi", icon: LuUtensils },
    ],
    []
  );

  return (
    <aside
      className="home-bottom-bar"
      style={{ height: HOME_BOTTOM_BAR_HEIGHT }}
      aria-label={username ? `${username} bottom navigation` : "App bottom navigation"}
    >
      <nav>
        <ul className="home-bottom-bar-list">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isHome = item.id === "home";
            const isActive = activeItem === item.id;

            return (
              <li key={item.id} className="home-bottom-bar-item">
                <button
                  type="button"
                  className={`home-bottom-bar-button ${isHome ? "is-home" : ""} ${isActive ? "active" : ""}`}
                  title={item.title}
                  aria-pressed={isActive}
                  onClick={() => onItemSelect(item.id)}
                >
                  <span className="home-bottom-bar-icon-wrap">
                    <Icon className="home-bottom-bar-icon" aria-hidden />
                  </span>
                  <span className="home-bottom-bar-label">{item.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
