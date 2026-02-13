import { useState } from "react";
import type { LoginResponse } from "../types/auth";
import TopBar from "../components/TopBar";
import LoginModal from "../components/LoginModal";
import HomeSideBar, {
  COLLAPSED_SIDEBAR_WIDTH,
  EXPANDED_SIDEBAR_WIDTH,
} from "../components/HomeSideBar";
import { TOP_BAR_HEIGHT } from "../components/style";
import reactLogo from "../assets/react.svg";
import bodyBackground from "../assets/conmeo_background.webp";

export default function LandingPage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [loginRes, setLoginRes] = useState<LoginResponse | null>(null);

  const handleLoginSuccess = (data: LoginResponse) => {
    setLoginRes(data);

    localStorage.setItem("token", data.token);
    localStorage.setItem("refreshToken", data.refreshToken);
  };

  return (
    <div>
      <TopBar
        username={loginRes?.token}
        onLoginClick={() => setIsLoginOpen(true)}
      />

      <HomeSideBar
        username={loginRes?.token}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      <div
        style={{
          marginTop: TOP_BAR_HEIGHT,
          marginLeft: isSidebarCollapsed
            ? COLLAPSED_SIDEBAR_WIDTH
            : EXPANDED_SIDEBAR_WIDTH,
          transition: "margin-left 0.2s ease",
        }}
      >
        <LoginModal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          onLoginSuccess={handleLoginSuccess}
        />

        <div>
          <div className="bodyImage">
            <img src={bodyBackground} alt="Background cats" />
          </div>
          <a href="https://react.dev" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <h1>Hello conmeo Vien</h1>
      </div>
    </div>
  );
}
