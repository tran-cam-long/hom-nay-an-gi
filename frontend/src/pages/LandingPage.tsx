import { useState } from "react";
import type { LoginResponse, LogoutRequest } from "../types/auth";
import TopBar from "../components/TopBar";
import LoginModal from "../components/LoginModal";
import HomeSideBar, {
  COLLAPSED_SIDEBAR_WIDTH,
  EXPANDED_SIDEBAR_WIDTH,
} from "../components/HomeSideBar";
import { TOP_BAR_HEIGHT } from "../components/style";
import bodyBackground from "../assets/conmeo_background.webp";
import NotificationModal from "../components/NotificationModal";
import { API_BASE_URL } from "../config";

export default function LandingPage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [loginRes, setLoginRes] = useState<LoginResponse | null>(null);
  const [notification, setNotification] = useState<{ isOpen: boolean; message: string}> ({
    isOpen: false,
    message: ""
  })

  const handleLoginSuccess = (data: LoginResponse) => {
    setLoginRes(data);

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

    setNotification({ isOpen: true, message: "Logged out"})
  };

  const sidebarWidth = isSidebarCollapsed 
    ? COLLAPSED_SIDEBAR_WIDTH 
    : EXPANDED_SIDEBAR_WIDTH;

  const pushX = sidebarWidth - COLLAPSED_SIDEBAR_WIDTH;

  return (
    <div>
      <TopBar
        username={loginRes?.username}
        onLoginClick={() => setIsLoginOpen(true)}
        onLogoutClick={handleLogout}
      />

      <HomeSideBar
        username={loginRes?.username}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      <div
        style={{
          marginTop: TOP_BAR_HEIGHT,
          width: `calc(100vw - ${COLLAPSED_SIDEBAR_WIDTH}px)`,
          transform: `translateX(${pushX}px)`,
          transition: "transform 0.2s ease",
        }}
      >
        <LoginModal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          onRegisterSuccess={handleRegisterSuccess}
        />

        <div>
          <div className="bodyImage">
            <img src={bodyBackground} alt="Background cats" />
          </div>
        </div>
        <h1>Hello conmeo Vien</h1>
      </div>

      <NotificationModal
        isOpen={notification.isOpen}
        message={notification.message}
        durationMs={5000}
        onClose={() => setNotification((prev) => ({ ...prev, isOpen: false }))} 
      />
    </div>
  );
}
