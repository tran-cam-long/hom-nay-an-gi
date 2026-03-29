import { useEffect, useState } from "react";
import type { AuthMeResponse, AuthSession, LoginResponse, LogoutRequest } from "../types/auth";
import TopBar from "../components/TopBar";
import LoginModal from "../components/LoginModal";
import HomeSideBar, {
  COLLAPSED_SIDEBAR_WIDTH,
  EXPANDED_SIDEBAR_WIDTH,
} from "../components/HomeSideBar";
import HomeBottomBar, {
  HOME_BOTTOM_BAR_HEIGHT,
} from "../components/HomeBottomBar";
import { TOP_BAR_HEIGHT } from "../components/style";
import bodyBackground from "../assets/conmeo_background.webp";
import NotificationModal from "../components/NotificationModal";
import { API_BASE_URL } from "../config";
import useIsMobile from "../hooks/useIsMobile";
import type { PageKey } from "../types/navigation";
import HomnayangiPage from "./HomnayangiPage";
import MultiplayerConnectionProvider from "../multiplayer/MultiplayerConnectionProvider";

export default function LandingPage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [loginRes, setLoginRes] = useState<AuthSession | null>(null);
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [notification, setNotification] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: ""
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const refreshToken = localStorage.getItem("refreshToken");

    if (!token) {
      return;
    }

    let isCancelled = false;

    const bootstrapSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Session bootstrap failed");
        }

        const session: AuthMeResponse = await response.json();

        if (!isCancelled) {
          setLoginRes({
            ...session,
            token,
            refreshToken,
          });
        }
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");

        if (!isCancelled) {
          setLoginRes(null);
        }
      }
    };

    void bootstrapSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleLoginSuccess = (data: LoginResponse) => {
    setLoginRes({
      userId: data.userId,
      username: data.username,
      token: data.token,
      refreshToken: data.refreshToken,
    });

    localStorage.setItem("token", data.token);
    localStorage.setItem("refreshToken", data.refreshToken);
  };

  const handleRegisterSuccess = () => {
    setNotification({ isOpen: true, message: "Account created!" })
  }

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");

    setLoginRes(null);
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");

    if (!refreshToken) {
      return;
    }

    try {
      const request: LogoutRequest = { refreshToken };

      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
    } catch {
      // Client is already logged out locally; ignore network errors.
    }

    setNotification({ isOpen: true, message: "Logged out" })
  };

  const sidebarWidth = isSidebarCollapsed
    ? COLLAPSED_SIDEBAR_WIDTH
    : EXPANDED_SIDEBAR_WIDTH;
  const isMobile = useIsMobile();

  return (
    <MultiplayerConnectionProvider
      accessToken={loginRes?.token}
      username={loginRes?.username}
    >
      <div>
        <TopBar
          username={loginRes?.username}
          onLoginClick={() => setIsLoginOpen(true)}
          onLogoutClick={handleLogout}
          onOpenHomnayangi={() => setActivePage("homnayangi")}
        />

        {!isMobile && (
          <HomeSideBar
            username={loginRes?.username}
            isCollapsed={isSidebarCollapsed}
            onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
            activeItem={activePage}
            onItemSelect={setActivePage}
          />
        )}

        {isMobile && (
          <HomeBottomBar
            username={loginRes?.username}
            activeItem={activePage}
            onItemSelect={setActivePage}
          />
        )}

        <div
          style={
            isMobile
              ? {
                marginTop: TOP_BAR_HEIGHT,
                width: "100vw",
                paddingBottom: HOME_BOTTOM_BAR_HEIGHT + 12,
              }
              : {
                marginTop: TOP_BAR_HEIGHT,
                width: `calc(100vw - ${sidebarWidth}px)`,
                marginLeft: sidebarWidth,
                transition: "margin-left 0.2s ease, width 0.2s ease",
              }
          }
        >
          {activePage === "home" && (
            <div>
              <div className="bodyImage">
                <img src={bodyBackground} alt="Background cats" />
              </div>
            </div>
          )}

          {activePage === "home" && <h1>Hello conmeo Vien</h1>}
          {activePage === "homnayangi" && <HomnayangiPage onNotify={(message) => setNotification({ isOpen: true, message })} />}
          {activePage === "settings" && (
            <section style={{ padding: 16 }}>
              <h2>Settings</h2>
              <p>Settings page is not implemented yet.</p>
            </section>
          )}
        </div>

        <LoginModal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          onRegisterSuccess={handleRegisterSuccess}
        />

        <NotificationModal
          isOpen={notification.isOpen}
          message={notification.message}
          durationMs={5000}
          onClose={() => setNotification((prev) => ({ ...prev, isOpen: false }))}
        />
      </div>
    </MultiplayerConnectionProvider>
  );
}
