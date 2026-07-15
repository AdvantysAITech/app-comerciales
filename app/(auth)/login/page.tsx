"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Loginage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("")

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        const resultado = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        if (resultado?.error){
            setError("Email o contraseña incorrectos");
            return;
        }

        router.push("/");
    }

    return (
        <form onSubmit={handleSubmit}>
            <h1>Iniciar sesión</h1>

            <label>
                Email
                <input type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)} 
                />
            </label>
            <label>
                Contraseña
                <input type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)} 
                />
            </label>

            {error && <p style={{ color: "red" }}>{error}</p>}

            <button type="submit">Entrar</button>
        </form>
    );
}