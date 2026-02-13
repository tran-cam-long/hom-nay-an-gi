import { useState } from "react";
import { inputStyle, modalStyle, overlayStyle } from "./style";
import "./LoginModal.css";
import { type LoginResponse } from "../types/auth";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: (data: LoginResponse) => void;
    onRegisterSuccess: (data: void) => void;
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess, onRegisterSuccess }: Props) {
    type ModalMode = "login" | "register";
    const [mode, setMode] = useState<ModalMode>("login");

    const [form, setForm] = useState({
        username: "",
        password: "",
        confirmPassword: "",
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        const nextForm = { ...form, [name]: value };
        setForm(nextForm);

        if (mode === "register") {
            if (
                nextForm.confirmPassword.length > 0 &&
                nextForm.password !== nextForm.confirmPassword
            ) {
                setError("Both passwords must match");
            } else {
                setError(null);
            }
        }
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);

        if (form.password.length === 0 || form.username.length === 0) {
            setError("Username and password are required!")
            setLoading(false);
            return;
        }

        if (mode === 'login') {
            handleLogin();
        } else if (mode === 'register') {
            handleRegister();
        }
    };

    const handleLogin = async () => {
        try {
            const res = await fetch("http://localhost:3000/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
            });

            if (!res.ok) {
                throw new Error("Login failed");
            }

            const data: LoginResponse = await res.json();

            onLoginSuccess(data);
            onClose();
        } catch (e) {
            setError("Invalid username/password");
        } finally {
            setLoading(false);
        }
    }

    const handleRegister = async () => {
        try {
            const res = await fetch("http://localhost:3000/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
            });

            if (res.status !== 201) {
                throw new Error("Register failed");
            }

            onRegisterSuccess();
        } catch (e) {
            setError("Register failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <h2>{mode === "login" ? "Login" : "Register"}</h2>

                <input
                    name="username"
                    placeholder="Username"
                    value={form.username}
                    onChange={handleChange}
                    style={inputStyle}
                />

                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={handleChange}
                    style={inputStyle}
                />

                {mode === "register" &&
                    <input
                        name="confirmPassword"
                        type="password"
                        placeholder="Confirm Password"
                        value={form.confirmPassword}
                        onChange={handleChange}
                        style={inputStyle}
                    />
                }

                {error && <p style={{ color: "red" }}>{error}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Submitting..." : "Submit"}
                    </button>
                    <button onClick={onClose}>Cancel</button>
                </div>

                <button type="button" className="auth-switch-link"
                    onClick={() => setMode(mode === "login" ? "register" : "login")}>
                    {
                        mode === "login"
                            ? "Don't have an account? Click here to register."
                            : "Already have an account? Back to login."
                    }
                </button>
            </div>
        </div>
    )
}