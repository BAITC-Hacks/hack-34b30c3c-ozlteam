import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { tokenStore } from "../../../shared/api/client";
import { LanguageSwitcher } from "../../../shared/i18n/LanguageSwitcher";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { Button, Field } from "../../../shared/ui";
import { useCurrentUser, useLogin } from "../hooks/useAuth";
import styles from "./LoginPage.module.css";

type FormValues = { email: string; password: string };

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
  const { t } = useI18n();
  const schema = z.object({
    email: z.email({ message: t("Введите корректную почту", "Жарамды электрондық поштаны енгізіңіз", "Enter a valid email address") }),
    password: z.string().min(8, t("Пароль не короче 8 символов", "Құпиясөз кемінде 8 таңбадан тұруы керек", "Password must be at least 8 characters") ),
  });
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
        <LanguageSwitcher />
        <span className={styles.brand}>
          <img className={styles.mark} src="/icon.svg" alt="" />
          {t("Центр закупок", "Сатып алу орталығы", "Procurement center")}
        </span>

        <div>
          <h1 className={styles.title}>{t("Вход", "Кіру", "Sign in")}</h1>
          <p className={styles.hint}>{t("Войдите рабочей почтой, выданной администратором.", "Әкімші берген жұмыс электрондық поштасымен кіріңіз.", "Sign in with the work email provided by your administrator.")}</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <Field
            label={t("Почта", "Электрондық пошта", "Email")}
            type="email"
            autoComplete="username"
            error={errors.email?.message}
            {...register("email")}
          />
          <Field
            label={t("Пароль", "Құпиясөз", "Password")}
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          {login.isError ? (
            <p className={styles.error} role="alert">
              {t("Не удалось войти. Проверьте почту и пароль.", "Кіру мүмкін болмады. Электрондық пошта мен құпиясөзді тексеріңіз.", "Could not sign in. Check your email and password.")}
            </p>
          ) : null}

          <Button type="submit" loading={login.isPending}>
            {t("Войти", "Кіру", "Sign in")}
          </Button>
        </form>
      </div>
    </div>
  );
}
