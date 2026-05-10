import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-slate-200">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">EVAS</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Host login</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in with an administrator-created host account. Public signup is disabled for v1.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
