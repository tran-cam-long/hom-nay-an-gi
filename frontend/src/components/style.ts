
export const TOP_BAR_HEIGHT = 60;

export const barStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: TOP_BAR_HEIGHT,
  padding: "0 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid #ddd",
  boxSizing: "border-box",
  background: "#fff",
  zIndex: 1000,
};

export const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1200,
};

export const modalStyle: React.CSSProperties = {
  background: "#fff",
  padding: "1rem",
  borderRadius: 8,
  width: "17rem",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const inputStyle: React.CSSProperties = {
  padding: "0.75rem",
  fontSize: "small",
};

