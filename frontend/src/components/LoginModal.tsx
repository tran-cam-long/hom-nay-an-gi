import { useState } from "react";
import { inputStyle, modalStyle, overlayStyle } from "./style";
import { type LoginRequest, type LoginResponse } from "../types/auth";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: (data: LoginResponse) => void;
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: Props) {
    const [form, setForm] = useState<LoginRequest>({
        username: "",
        password: "",
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);

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
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <h2>Login</h2>

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

                {error && <p style={{ color: "red" }}>{error}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Submitting..." : "Submit"}
                    </button>
                    <button onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    )
}