import { zodResolver } from "@hookform/resolvers/zod";
import { Container } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { tokenStore } from "../../../shared/api/client";
import { Button, Field } from "../../../shared/ui";
import { useCurrentUser, useLogin } from "../hooks/useAuth";
import styles from "./LoginPage.module.css";

const schema = z.object({
  email: z.email({ message: "Введите корректную почту" }),
  password: z.string().min(8, "Пароль не короче 8 символов"),
});

type FormValues = z.infer<typeof schema>;

function returnPath(state: unknown): string {
  const from = state && typeof state === "object" && "from" in state ? state.from : null;
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return "/";
  try {
    const url = new URL(from, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === "/login") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = returnPath(location.state);
  const { data: user } = useCurrentUser();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: import.meta.env.DEV ? "demo-local-12345" : "",
    },
  });

  if (tokenStore.get() !== null && user) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
    });
  });

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <Container size={15} strokeWidth={1.8} />
          </span>
          План закупок
        </span>

        <div>
          <h1 className={styles.title}>Вход</h1>
          <p className={styles.hint}>Войдите рабочей почтой, выданной администратором.</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <Field
            label="Почта"
            type="email"
            autoComplete="username"
            error={errors.email?.message}
            {...register("email")}
          />
          <Field
            label="Пароль"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          {login.isError ? (
            <p className={styles.error} role="alert">
              Не удалось войти. Проверьте почту и пароль.
            </p>
          ) : null}

          <Button type="submit" loading={login.isPending}>
            Войти
          </Button>
        </form>
      </div>
    </div>
  );
}
